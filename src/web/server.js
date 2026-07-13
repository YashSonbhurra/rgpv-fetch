import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { RgpvFetch } from '../lib/index.js';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const publicDir = path.resolve(__dirname, 'public');
app.use(express.static(publicDir));

const coursesPath = path.resolve(__dirname, '../lib/courses.json');
const courses = JSON.parse(fs.readFileSync(coursesPath, 'utf8'));

let colleges = {};
try {
  const collegesPath = path.resolve(__dirname, '../lib/colleges.json');
  if (fs.existsSync(collegesPath)) {
    colleges = JSON.parse(fs.readFileSync(collegesPath, 'utf8'));
  }
} catch (err) {
  // Silent fallback
}

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

let sseClients = [];

// Broadcast event to all active SSE client streams
function broadcastEvent(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (err) {
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
  try {
    const branchesPath = path.resolve(__dirname, '../lib/branches.json');
    const branches = JSON.parse(fs.readFileSync(branchesPath, 'utf8'));
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load branches' });
  }
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
app.post('/api/scrape/start', async (req, res) => {
  if (activeJob.status === 'scraping') {
    return res.status(400).json({ error: 'A scraping job is already active.' });
  }

  const { courseId, semester, rollInput, concurrency, staggerDelay, delay, retries, useCache, includeLateral, lateralRange } = req.body;

  if (!courseId || !semester || !rollInput) {
    return res.status(400).json({ error: 'Missing required configuration parameters.' });
  }

  activeJob = {
    status: 'scraping',
    progress: { current: 0, total: 0, enrollId: 'Starting...', status: 'starting', message: 'Configuring scraping worker...' },
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

  res.json({ message: 'Scraper job successfully started' });

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
        activeJob.progress.status = 'aborted';
        broadcastEvent('state', { status: activeJob.status, progress: activeJob.progress, results: activeJob.results, semester: activeJob.semester, courseId: activeJob.courseId, duration: activeJob.duration });
      } else {
        activeJob.status = 'completed';
        activeJob.progress.status = 'completed';
        broadcastEvent('state', { status: activeJob.status, progress: activeJob.progress, results: activeJob.results, semester: activeJob.semester, courseId: activeJob.courseId, duration: activeJob.duration });
      }
    } catch (err) {
      activeJob.status = 'failed';
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
    return res.status(400).json({ error: 'No scraping job is currently active.' });
  }

  if (activeScraperInstance) {
    try {
      await activeScraperInstance.close();
    } catch (err) {
      // Ignore
    }
  }

  activeJob.status = 'aborted';
  activeJob.progress.status = 'aborted';
  broadcastEvent('state', { status: activeJob.status, progress: activeJob.progress, semester: activeJob.semester, courseId: activeJob.courseId });
  res.json({ message: 'Scrape job successfully aborted' });
});

// POST endpoint to reset scraper memory state
app.post('/api/scrape/reset', (req, res) => {
  if (activeJob.status === 'scraping') {
    return res.status(400).json({ error: 'Cannot reset scraper state while scraping is active.' });
  }

  activeJob = {
    status: 'idle',
    progress: { current: 0, total: 0, enrollId: '', status: '', message: '' },
    results: [],
    semester: '3'
  };
  broadcastEvent('state', { status: activeJob.status, progress: activeJob.progress });
  res.json({ message: 'Scraper state successfully reset' });
});

// POST endpoint to clear scraped file cache
app.post('/api/scrape/clear-cache', (req, res) => {
  if (activeJob.status === 'scraping') {
    return res.status(400).json({ error: 'Cannot clear cache while scraping is active.' });
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
app.get('/api/scrape/export', (req, res) => {
  const format = req.query.format || 'xlsx';
  const courseId = req.query.courseId || '24';
  const semester = req.query.sem || activeJob.semester || '3';
  const branch = req.query.branch || 'ALL';

  if (activeJob.results.length === 0) {
    return res.status(400).send('No data available to export. Run a scrape job first.');
  }

  let filteredResults = activeJob.results;
  if (branch && branch !== 'ALL') {
    filteredResults = filteredResults.filter(r => r.enrollId && r.enrollId.substring(4, 6).toUpperCase() === branch.toUpperCase());
  }

  const { headers, successfulRows, failedRows } = prepareTableDataForServer(filteredResults, courseId, semester);

  let clgCode = 'ALL';
  let branchCode = branch.toUpperCase();
  if (filteredResults.length > 0) {
    const sampleEnroll = filteredResults[0].enrollId;
    if (sampleEnroll && sampleEnroll.length >= 4) {
      clgCode = sampleEnroll.substring(0, 4);
    }
  }

  const baseFilename = `RGPV_${clgCode}_Sem${semester}_${branchCode}`;

  if (format === 'csv') {
    const csvContent = convertToCSVForServer(headers, successfulRows, failedRows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.csv"`);
    return res.send(csvContent);
  } else if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(successfulRows, { header: headers });

    if (failedRows.length > 0) {
      const startRow = successfulRows.length + 3;
      XLSX.utils.sheet_add_aoa(ws, [
        ['FAILED SCRAPES'],
        ['EnrollId', 'Error']
      ], { origin: `A${startRow}` });

      const failedAOA = failedRows.map(f => [f.enrollId, f.error]);
      XLSX.utils.sheet_add_aoa(ws, failedAOA, { origin: `A${startRow + 2}` });
    }

    XLSX.utils.book_append_sheet(wb, ws, "Student Results");
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.xlsx"`);
    return res.send(buffer);
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.json"`);
    const formattedJSON = formatJSONResults(filteredResults, courseId, semester);
    return res.json(formattedJSON);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

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
        let endStr = rangeParts[1].trim().toUpperCase();

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

// Transforms scraper results into standard structured JSON export layout
function formatJSONResults(resultsArray, courseId, semester) {
  const successful = resultsArray.filter(res => !res.error);
  return successful.map(res => {
    const roll = res.enrollId;
    const clgCode = roll.substring(0, 4);
    const branch = roll.substring(4, 6).toUpperCase();
    const clgName = colleges[clgCode]?.name || clgCode;
    const courseName = courses[courseId]?.name || courseId;

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
      course: courseName,
      college: clgName,
      branch: branch,
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
    'EnrollId', 'Name', 'Course', 'College', 'Semester', 'Branch', 'Status', 'SGPA', 'CGPA',
    ...subjectHeaders
  ];

  const successfulRows = successful.map(res => {
    const enrollId = res.enrollId;
    const clgCode = enrollId.substring(0, 4);
    const branch = enrollId.substring(4, 6);
    const clgName = colleges[clgCode]?.name || clgCode;
    const courseName = courses[courseId]?.name || courseId;

    const row = {
      EnrollId: enrollId,
      Name: res.name || '',
      Course: courseName,
      College: clgName,
      Semester: semester,
      Branch: branch,
      Status: res.status || '',
      SGPA: res.sgpa || '',
      CGPA: res.cgpa || '',
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
