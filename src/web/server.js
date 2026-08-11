import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { RgpvFetch } from '../lib/index.js';
import ExcelJS from 'exceljs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const publicDir = path.resolve(__dirname, 'public');
app.use(express.static(publicDir));

const coursesPath = path.resolve(__dirname, '../data/courses.json');
const courses = JSON.parse(fs.readFileSync(coursesPath, 'utf8'));

let colleges = {};
try {
  const collegesPath = path.resolve(__dirname, '../data/colleges.json');
  if (fs.existsSync(collegesPath)) {
    colleges = JSON.parse(fs.readFileSync(collegesPath, 'utf8'));
  }
} catch {
  // Silent fallback
}

let branches = {};
try {
  const branchesPath = path.resolve(__dirname, '../data/branches.json');
  if (fs.existsSync(branchesPath)) {
    branches = JSON.parse(fs.readFileSync(branchesPath, 'utf8'));
  }
} catch {
  // Silent fallback
}

// Largest number of distinct branch codes listed in a filename before collapsing to 'ALL'
const MAX_BRANCHES_IN_FILENAME = 4;

let activeJob = {
  status: 'idle',
  progress: {
    current: 0,
    total: 0,
    enrollId: '',
    status: '',
    message: ''
  },
  results: [],
  semester: '',
  courseId: '24',
  duration: null
};

// Settles the last in-flight progress snapshot, whose count optimistically includes the record being mined
function finalizeProgress(status) {
  activeJob.progress = { ...activeJob.progress, status, current: activeJob.results.length };
}

let sseClients = [];

// Broadcast event to all active SSE client streams
function broadcastEvent(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch {
      // Ignore broken connections
    }
  });
}

app.get('/api/courses', (req, res) => {
  res.json(courses);
});

app.get('/api/colleges', (req, res) => {
  res.json(colleges);
});

app.get('/api/branches', (req, res) => {
  if (Object.keys(branches).length === 0) {
    return res.status(500).json({ error: 'Failed to load branches' });
  }
  res.json(branches);
});

// SSE endpoint to monitor live scraping status
app.get('/api/scrape/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { id: Date.now(), res };
  sseClients.push(client);

  res.write(`event: state\ndata: ${JSON.stringify({
    status: activeJob.status,
    progress: activeJob.progress,
    resultsCount: activeJob.results.length,
    results: activeJob.results,
    semester: activeJob.semester,
    courseId: activeJob.courseId
  })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== client.id);
  });
});

// POST endpoint to trigger bulk scraping job in background
let activeScraperInstance = null;
app.post('/api/scrape/start', (req, res) => {
  if (activeJob.status === 'scraping') {
    return res.status(400).json({ error: 'A mining job is already active.' });
  }

  const { courseId, semester, rollInput, concurrency, staggerDelay, delay, retries, useCache, includeLateral, lateralRange } = req.body;

  if (!courseId || !semester || !rollInput) {
    return res.status(400).json({ error: 'Missing required configuration parameters.' });
  }

  activeJob = {
    status: 'scraping',
    progress: { current: 0, total: 0, enrollId: 'Starting...', status: 'starting', message: 'Configuring mining worker...' },
    results: [],
    semester: semester,
    courseId: courseId,
    duration: null
  };
  broadcastEvent('state', {
    status: activeJob.status,
    progress: activeJob.progress,
    semester: activeJob.semester,
    courseId: activeJob.courseId
  });

  res.json({ message: 'Mining job successfully started' });

  (async () => {
    const startTime = Date.now();
    try {
      activeScraperInstance = new RgpvFetch({
        maxRetries: parseInt(retries, 10) ?? 2,
        delay: parseInt(delay, 10) ?? 5000,
        useCache: useCache !== false,
        concurrency: parseInt(concurrency, 10) ?? 6,
        staggerDelay: parseInt(staggerDelay, 10) ?? 900
      });

      const rollNumbers = parseRollRangeForServer(rollInput);
      activeJob.progress.total = rollNumbers.length;
      broadcastEvent('progress', activeJob.progress);

      const results = await activeScraperInstance.getBulkResults(rollNumbers, semester, courseId, (progress) => {
        activeJob.progress = progress;

        if (progress.status === 'success') {
          activeJob.results.push(progress.data);
          broadcastEvent('student', progress.data);
        } else if (progress.status === 'error') {
          const failedRecord = { enrollId: progress.enrollId, error: progress.error };
          activeJob.results.push(failedRecord);
          broadcastEvent('student', failedRecord);
        }

        broadcastEvent('progress', progress);
      }, { includeLateral, range: lateralRange });

      // Filter out any errors that were discarded at the end of open-ended queries (keep only first of 5 not-founds)
      activeJob.results = activeJob.results.filter(r => results[r.enrollId] !== undefined);

      activeJob.duration = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));

      if (activeScraperInstance && activeScraperInstance.stopped) {
        activeJob.status = 'aborted';
        finalizeProgress('aborted');
        broadcastEvent('state', { status: activeJob.status, progress: activeJob.progress, results: activeJob.results, semester: activeJob.semester, courseId: activeJob.courseId, duration: activeJob.duration });
      } else {
        activeJob.status = 'completed';
        finalizeProgress('completed');
        broadcastEvent('state', { status: activeJob.status, progress: activeJob.progress, results: activeJob.results, semester: activeJob.semester, courseId: activeJob.courseId, duration: activeJob.duration });
      }
    } catch {
      activeJob.status = 'failed';
      finalizeProgress('failed');
      activeJob.duration = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
      broadcastEvent('state', { status: activeJob.status, progress: activeJob.progress, semester: activeJob.semester, courseId: activeJob.courseId, duration: activeJob.duration });
    } finally {
      activeScraperInstance = null;
    }
  })();
});

// POST endpoint to abort active scraping job
app.post('/api/scrape/stop', async (req, res) => {
  if (activeJob.status !== 'scraping') {
    return res.status(400).json({ error: 'No mining job is currently active.' });
  }

  if (activeScraperInstance) {
    try {
      await activeScraperInstance.abort();
    } catch {
      // Ignore
    }
  }

  activeJob.status = 'aborted';
  finalizeProgress('aborted');
  broadcastEvent('state', { status: activeJob.status, progress: activeJob.progress, results: activeJob.results, semester: activeJob.semester, courseId: activeJob.courseId });
  res.json({ message: 'Mining job successfully aborted' });
});

// POST endpoint to reset scraper memory state
app.post('/api/scrape/reset', (req, res) => {
  if (activeJob.status === 'scraping') {
    return res.status(400).json({ error: 'Cannot reset miner state while mining is active.' });
  }

  activeJob = {
    status: 'idle',
    progress: { current: 0, total: 0, enrollId: '', status: '', message: '' },
    results: [],
    semester: '3'
  };
  broadcastEvent('state', { status: activeJob.status, progress: activeJob.progress });
  res.json({ message: 'Miner state successfully reset' });
});

// POST endpoint to clear scraped file cache
app.post('/api/scrape/clear-cache', (req, res) => {
  if (activeJob.status === 'scraping') {
    return res.status(400).json({ error: 'Cannot clear cache while mining is active.' });
  }

  const cachePath = path.resolve(os.homedir(), '.cache', 'rgpv-fetch');
  if (fs.existsSync(cachePath)) {
    try {
      const files = fs.readdirSync(cachePath);
      let count = 0;
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(cachePath, file));
          count++;
        }
      }
      return res.json({ message: `Successfully cleared ${count} cached student records.` });
    } catch (err) {
      return res.status(500).json({ error: `Failed to clear cache: ${err.message}` });
    }
  }
  res.json({ message: 'No cache files existed to clear.' });
});

// GET endpoint to download scraped results in XLSX, CSV or JSON format
app.get('/api/scrape/export', async (req, res) => {
  const format = req.query.format || 'xlsx';
  const courseId = req.query.courseId || '24';
  const semester = req.query.sem || activeJob.semester || '3';
  const branch = req.query.branch || 'ALL';

  if (activeJob.results.length === 0) {
    return res.status(400).send('No data available to export. Run a mining job first.');
  }

  let filteredResults = activeJob.results;
  if (branch && branch !== 'ALL') {
    filteredResults = filteredResults.filter(r => r.enrollId && r.enrollId.substring(4, 6).toUpperCase() === branch.toUpperCase());
  }

  const { headers, successfulRows, failedRows } = prepareTableDataForServer(filteredResults, courseId, semester);

  const courseName = (courses[courseId]?.name || 'Unknown Course').replace(/[^A-Za-z]/g, '');
  const clgCode = enrollSegmentLabel(filteredResults.map(r => r.enrollId), 0, 4, 1);
  const branchCode = branch !== 'ALL'
    ? branch.toUpperCase()
    : enrollSegmentLabel(filteredResults.map(r => r.enrollId), 4, 6, MAX_BRANCHES_IN_FILENAME);

  const baseFilename = `RGPV_${courseName}_${clgCode}_Sem${semester}_${branchCode}`;

  if (format === 'csv') {
    const csvContent = convertToCSVForServer(headers, successfulRows, failedRows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.csv"`);
    return res.send(csvContent);
  } else if (format === 'xlsx') {
    const wb = buildWorkbookForServer(headers, successfulRows, failedRows);
    const buffer = await wb.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.xlsx"`);
    return res.send(buffer);
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.json"`);
  const formattedJSON = formatJSONResults(filteredResults, courseId, semester);
  return res.send(JSON.stringify(formattedJSON, null, 2));

});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

// Lists the distinct enrollment ID segments across every record, or 'ALL' past maxCodes of them
function enrollSegmentLabel(enrollIds, start, end, maxCodes) {
  const codes = Array.from(new Set(
    enrollIds.filter(id => id && id.length >= end).map(id => id.substring(start, end).toUpperCase())
  )).sort();

  if (codes.length === 0 || codes.length > maxCodes) {
    return 'ALL';
  }

  return codes.join('-');
}

// Suffix-range enrollment ID list generator and range parser
function parseRollRangeForServer(input) {
  const parts = input.split(',').map(p => p.trim());
  const finalIds = [];

  for (const part of parts) {
    if (!part) continue;

    if (part.includes('-')) {
      const rangeParts = part.split('-');
      if (rangeParts.length === 2) {
        const startStr = rangeParts[0].trim().toUpperCase();
        const endStr = rangeParts[1].trim().toUpperCase();

        if (startStr.length !== 12 || !startStr.match(/^[A-Z0-9]{8}\d{4}$/)) {
          throw new Error(`Invalid starting roll number: ${startStr}. Expected a 12-character RGPV ID.`);
        }

        if (endStr === '') {
          finalIds.push(`${startStr}-`);
          continue;
        }

        const prefix = startStr.substring(0, 9);
        const startSeqStr = startStr.substring(9);
        const startNum = parseInt(startSeqStr, 10);

        let endNum;
        if (endStr.match(/^\d+$/)) {
          const endSeqStr = endStr.substring(Math.max(0, endStr.length - 3)).padStart(3, '0');
          endNum = parseInt(endSeqStr, 10);
        } else {
          if (endStr.length !== 12) {
            throw new Error(`Invalid ending roll number: ${endStr}. Expected a 12-character RGPV ID.`);
          }
          if (endStr.substring(0, 9) !== prefix) {
            throw new Error(`Roll number prefix mismatch between ${startStr} and ${endStr}`);
          }
          endNum = parseInt(endStr.substring(9), 10);
        }

        const min = Math.min(startNum, endNum);
        const max = Math.max(startNum, endNum);

        if (max - min > 1000) {
          throw new Error(`Range size (${max - min}) exceeds safety limit of 1000`);
        }

        for (let i = min; i <= max; i++) {
          finalIds.push(`${prefix}${String(i).padStart(3, '0')}`);
        }
      } else {
        throw new Error(`Invalid range format: ${part}`);
      }
    } else {
      finalIds.push(part.toUpperCase());
    }
  }

  return Array.from(new Set(finalIds));
}

// Maps the parsed result layout to a human readable label
function formatLabel(format) {
  if (format === 'grading') return 'Grading';
  if (format === 'non-grading') return 'Non-Grading';
  return 'Unknown';
}

// Transforms scraper results into standard structured JSON export layout
function formatJSONResults(resultsArray, courseId, semester) {
  const successful = resultsArray.filter(res => !res.error);
  return successful.map(res => {
    const roll = res.enrollId;
    const clgCode = roll.substring(0, 4);
    const branchCode = roll.substring(4, 6).toUpperCase();
    const clgName = colleges[clgCode]?.name || clgCode;
    const branchName = branches[branchCode] || branchCode;
    const courseName = courses[courseId]?.name || 'Unknown Course';

    const grades = {};
    if (res.subjects) {
      // Sort subjects: [T] theory first, then [P] practical, then others, alphabetically
      const sortedSubjects = [...res.subjects].sort((a, b) => {
        const getPriority = (str) => {
          if (str.includes('[T]')) return 1;
          if (str.includes('[P]')) return 2;
          return 3;
        };
        const codeA = a.subject || a.subjectCode || '';
        const codeB = b.subject || b.subjectCode || '';
        const pA = getPriority(codeA);
        const pB = getPriority(codeB);
        if (pA !== pB) return pA - pB;
        return codeA.localeCompare(codeB);
      });

      sortedSubjects.forEach(sub => {
        const code = sub.subject || sub.subjectCode;
        if (code) {
          grades[code] = sub.grade || sub.total || 'NA';
        }
      });
    }

    const parseGPA = (val) => {
      const num = parseFloat(val);
      return isNaN(num) ? 'N/A' : num;
    };

    return {
      name: res.name || '',
      roll: roll,
      format: formatLabel(res.format),
      status: res.studentStatus || '',
      course: courseName,
      courseId: parseInt(courseId, 10),
      college: clgName,
      collegeCode: clgCode,
      branch: branchName,
      branchCode: branchCode,
      sem: parseInt(semester, 10),
      result: res.status || '',
      sgpa: parseGPA(res.sgpa),
      cgpa: parseGPA(res.cgpa),
      grades: grades
    };
  });
}

// Formats scraper results into AOA headers and rows for Excel/CSV export
function prepareTableDataForServer(resultsArray, courseId, semester) {
  const successful = resultsArray.filter(res => !res.error);
  const failedRows = resultsArray.filter(res => res.error).map(res => ({
    enrollId: res.enrollId,
    error: res.error
  }));

  if (successful.length === 0) {
    return { headers: [], successfulRows: [], failedRows };
  }

  const subjectKeys = new Set();
  successful.forEach(res => {
    if (res.subjects) {
      res.subjects.forEach(sub => {
        const key = sub.subject || sub.subjectCode;
        if (key) subjectKeys.add(key);
      });
    }
  });

  const subjectHeaders = Array.from(subjectKeys).sort((a, b) => {
    const getPriority = (str) => {
      if (str.includes('[T]')) return 1;
      if (str.includes('[P]')) return 2;
      return 3;
    };
    const pA = getPriority(a);
    const pB = getPriority(b);
    if (pA !== pB) return pA - pB;
    return a.localeCompare(b);
  });
  const headers = [
    'EnrollId', 'Name', 'Format', 'Status', 'Course', 'College', 'Semester', 'Branch', 'Result', 'SGPA', 'CGPA',
    ...subjectHeaders
  ];

  const successfulRows = successful.map(res => {
    const enrollId = res.enrollId;
    const clgCode = enrollId.substring(0, 4);
    const branch = enrollId.substring(4, 6);
    const clgName = colleges[clgCode]?.name || clgCode;
    const courseName = courses[courseId]?.name || 'Unknown Course';

    const row = {
      EnrollId: enrollId,
      Name: res.name || '',
      Format: formatLabel(res.format),
      Status: res.studentStatus || '',
      Course: courseName,
      College: clgName,
      Semester: String(semester),
      Branch: branch,
      Result: res.status || '',
      SGPA: res.sgpa || '',
      CGPA: res.cgpa || ''
    };

    subjectHeaders.forEach(hdr => {
      row[hdr] = '';
    });

    if (res.subjects) {
      res.subjects.forEach(sub => {
        const key = sub.subject || sub.subjectCode;
        const val = sub.grade || sub.total || 'N/A';
        row[key] = val;
      });
    }

    return row;
  });

  successfulRows.sort((a, b) => a.EnrollId.localeCompare(b.EnrollId));
  failedRows.sort((a, b) => a.enrollId.localeCompare(b.enrollId));

  return { headers, successfulRows, failedRows };
}

// Converts prepared table headers and rows to a plain CSV string
function convertToCSVForServer(headers, successfulRows, failedRows) {
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [headers.map(escapeCsv).join(',')];

  successfulRows.forEach(row => {
    const line = headers.map(hdr => escapeCsv(row[hdr]));
    csvRows.push(line.join(','));
  });

  if (failedRows.length > 0) {
    csvRows.push('');
    csvRows.push('FAILED SCRAPES');
    csvRows.push('EnrollId,Error');
    failedRows.forEach(f => {
      csvRows.push(`${escapeCsv(f.enrollId)},${escapeCsv(f.error)}`);
    });
  }

  return csvRows.join('\n');
}

// Count of fixed columns preceding the per-subject columns in prepareTableData's header list
const BASE_COLUMN_COUNT_FOR_SERVER = 11;

// Adds one styled worksheet built from prepared table data
function addStyledSheetForServer(wb, sheetName, headers, successfulRows, failedRows) {
  const ws = wb.addWorksheet(sheetName);

  ws.columns = headers.map(header => ({ header, key: header }));
  successfulRows.forEach(row => ws.addRow(row));

  const widths = headers.map(header => header.length);
  successfulRows.forEach(row => {
    headers.forEach((header, i) => {
      widths[i] = Math.max(widths[i], String(row[header] ?? '').length);
    });
  });

  if (failedRows.length > 0) {
    const startRow = successfulRows.length + 3;

    ws.getRow(startRow).getCell(1).value = 'FAILED SCRAPES';
    ws.getRow(startRow + 1).getCell(1).value = 'EnrollId';
    ws.getRow(startRow + 1).getCell(2).value = 'Error';
    ws.getRow(startRow).getCell(1).font = { bold: true };
    ws.getRow(startRow + 1).getCell(1).font = { bold: true };
    ws.getRow(startRow + 1).getCell(2).font = { bold: true };

    failedRows.forEach((f, i) => {
      const row = ws.getRow(startRow + 2 + i);
      row.getCell(1).value = f.enrollId;
      row.getCell(2).value = f.error;

      widths[0] = Math.max(widths[0], 'FAILED SCRAPES'.length, String(f.enrollId ?? '').length);
      widths[1] = Math.max(widths[1], String(f.error ?? '').length);
    });
  }

  ws.columns.forEach((column, i) => {
    column.width = Math.min(Math.max(widths[i] + 2, 10), 40);
  });

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });

  const lastRow = successfulRows.length + 1;
  const outer = { style: 'thin', color: { argb: 'FF808080' } };
  const inner = { style: 'thin', color: { argb: 'FFBFBFBF' } };

  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= headers.length; c++) {
      const border = {
        left: c === 1 ? outer : inner,
        right: c === headers.length ? outer : inner
      };

      if (r === 1) {
        border.top = outer;
      }
      if (r === 1 || r === lastRow) {
        border.bottom = outer;
      }

      ws.getRow(r).getCell(c).border = border;
    }
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// Builds the results workbook, one worksheet per branch when several are present
function buildWorkbookForServer(headers, successfulRows, failedRows) {
  const wb = new ExcelJS.Workbook();
  const branchOf = enrollId => (enrollId || '').substring(4, 6) || 'UNKNOWN';

  const branches = Array.from(new Set([
    ...successfulRows.map(row => row.Branch),
    ...failedRows.map(f => branchOf(f.enrollId))
  ])).sort();

  if (branches.length <= 1) {
    addStyledSheetForServer(wb, 'Student Results', headers, successfulRows, failedRows);
    return wb;
  }

  branches.forEach(branch => {
    const rows = successfulRows.filter(row => row.Branch === branch);
    const failed = failedRows.filter(f => branchOf(f.enrollId) === branch);
    const subjects = headers.slice(BASE_COLUMN_COUNT_FOR_SERVER)
      .filter(header => rows.some(row => String(row[header] ?? '') !== ''));

    addStyledSheetForServer(wb, branch, [...headers.slice(0, BASE_COLUMN_COUNT_FOR_SERVER), ...subjects], rows, failed);
  });

  return wb;
}
