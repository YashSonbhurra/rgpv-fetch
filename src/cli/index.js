#!/usr/bin/env node

import { Command } from 'commander';
import cliProgress from 'cli-progress';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { RgpvFetch } from '../lib/index.js';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coursesPath = path.resolve(__dirname, '../lib/courses.json');
const courses = JSON.parse(fs.readFileSync(coursesPath, 'utf8'));

const collegesPath = path.resolve(__dirname, '../lib/colleges.json');
const colleges = JSON.parse(fs.readFileSync(collegesPath, 'utf8'));

const program = new Command();

program
  .name('rgpv-fetch')
  .description('CLI tool to scrape and analyze student results from RGPV University')
  .version('1.0.0');

// Parse roll number ranges or lists (supports ranges inside list elements)
// Pattern prefix includes the digit in the 4th from last place, and sequence range is for the last 3 digits
function parseRollRange(input) {
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
          throw new Error(`Invalid starting roll number: ${startStr}. Expected a 12-character RGPV enrollment ID.`);
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
            throw new Error(`Invalid ending roll number: ${endStr}. Expected a 12-character RGPV enrollment ID.`);
          }
          if (endStr.substring(0, 9) !== prefix) {
            throw new Error(`Roll number prefix mismatch between ${startStr} and ${endStr}`);
          }
          endNum = parseInt(endStr.substring(9), 10);
        }

        const min = Math.min(startNum, endNum);
        const max = Math.max(startNum, endNum);

        if (max - min > 1000) {
          throw new Error(`Range size (${max - min}) exceeds the safe limit of 1000 roll numbers`);
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

// Prepares structured table headers and row objects from scraped student records
function prepareTableData(resultsArray, courseId, semester) {
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

// Converts prepared AOA table data to a plain CSV string
function convertToCSV(headers, successfulRows, failedRows) {
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

// Writes prepared table data directly to an Excel sheet on disk
function writeToExcel(headers, successfulRows, failedRows, outPath) {
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
  XLSX.writeFile(wb, outPath);
}

// Formats duration in seconds to standard 'm s' or 's' layout
function formatDuration(seconds) {
  const totalSecs = Math.round(seconds);
  if (totalSecs < 60) {
    return `${totalSecs}s`;
  }
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
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

// CLI command: scrape results
program
  .command('scrape')
  .description('Scrape results for a single or range of enrollment numbers')
  .option('-c, --course <courseId>', 'Course ID (run "rgpv-fetch courses" to list)', '24')
  .requiredOption('-s, --sem <semester>', 'Semester (numeric value, e.g. 3)')
  .requiredOption('-r, --roll <rollNumbers>', 'Enrollment numbers (single, comma-separated, or range e.g. 0103AL241001-020)')
  .option('-o, --out <filePath>', 'Output file path (JSON, CSV, or XLSX)')
  .option('--no-cache', 'Force re-fetch results')
  .option('--delay <ms>', 'Delay between student postbacks in ms, recommended to leave as is', '5000')
  .option('--retries <count>', 'Maximum retry attempts', '2')
  .option('--concurrency <threads>', 'Number of parallel workers', '6')
  .option('--stagger-delay <ms>', 'Delay interval between starting each parallel worker in ms', '900')
  .option('--cache-path <path>', 'Custom directory path to store cache files')
  .action(async (options) => {
    const courseId = String(options.course);
    const semester = parseInt(options.sem, 10);
    const rollInput = options.roll;
    
    if (!courses[courseId]) {
      console.error(`Error: Invalid course ID "${courseId}". Run "rgpv-fetch courses" to see valid options.`);
      process.exit(1);
    }

    if (isNaN(semester)) {
      console.error(`Error: Semester must be a numeric value.`);
      process.exit(1);
    }

    let enrollIds = [];
    try {
      enrollIds = parseRollRange(rollInput);
    } catch (err) {
      console.error(`Error parsing roll numbers: ${err.message}`);
      process.exit(1);
    }

    if (enrollIds.length === 0) {
      console.error('Error: No enrollment numbers generated.');
      process.exit(1);
    }

    let outPath;
    if (options.out) {
      outPath = path.resolve(options.out);
    } else {
      let clgCode = 'ALL';
      let branchCode = 'ALL';
      if (enrollIds.length > 0) {
        const sampleEnroll = enrollIds[0];
        if (sampleEnroll && sampleEnroll.length >= 6) {
          clgCode = sampleEnroll.substring(0, 4);
          branchCode = sampleEnroll.substring(4, 6).toUpperCase();
        }
      }
      outPath = path.resolve(`./RGPV_${clgCode}_Sem${semester}_${branchCode}.xlsx`);
    }

    console.log(`Starting scrape job:`);
    console.log(`- Course      : ${courses[courseId].name} (${courseId})`);
    console.log(`- Semester    : ${semester}`);
    const hasOpenEnded = enrollIds.some(id => id.endsWith('-'));
    console.log(`- Students    : ${hasOpenEnded ? 'Open-ended range (scanning sequentially)' : `${enrollIds.length} roll numbers`}`);
    console.log(`- Concurrency : ${options.concurrency}`);
    console.log(`- Stagger     : ${options.staggerDelay} ms`);
    console.log(`- Delay       : ${options.delay} ms`);
    console.log(`- Retries     : ${options.retries}`);
    console.log(`- Output File : ${outPath}`);
    console.log(`\nInitializing worker...`);

    const scraper = new RgpvFetch({
      maxRetries: parseInt(options.retries, 10),
      delay: parseInt(options.delay, 10),
      useCache: !!options.cache,
      concurrency: parseInt(options.concurrency, 10),
      staggerDelay: parseInt(options.staggerDelay, 10),
      cachePath: options.cachePath || undefined
    });

    const barFormat = hasOpenEnded
      ? 'Scraping | {value} Students fetched | Current: {enrollId}'
      : 'Scraping | {bar} | {percentage}% | {value}/{total} Students | Current: {enrollId}';

    const progressBar = new cliProgress.SingleBar({
      format: barFormat,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    }, cliProgress.Presets.shades_classic);

    const startTime = Date.now();
    progressBar.start(enrollIds.length, 0, { enrollId: 'N/A' });

    try {
      const results = await scraper.getBulkResults(enrollIds, semester, courseId, (progress) => {
        if (progress.total) {
          progressBar.setTotal(progress.total);
        }
        if (progress.status === 'scraping') {
          progressBar.update(progress.current - 1, { enrollId: progress.enrollId });
        } else {
          progressBar.update(progress.current, { enrollId: progress.enrollId });
        }
      });

      progressBar.stop();
      const durationS = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('\nScraping complete. Exporting results...');

      const resultsArray = Object.values(results);
      const ext = path.extname(outPath).toLowerCase();

      if (ext === '.csv') {
        const { headers, successfulRows, failedRows } = prepareTableData(resultsArray, courseId, semester);
        const csvContent = convertToCSV(headers, successfulRows, failedRows);
        fs.writeFileSync(outPath, csvContent, 'utf8');
      } else if (ext === '.xlsx' || ext === '.xls') {
        const { headers, successfulRows, failedRows } = prepareTableData(resultsArray, courseId, semester);
        writeToExcel(headers, successfulRows, failedRows, outPath);
      } else {
        const formattedJSON = formatJSONResults(resultsArray, courseId, semester);
        fs.writeFileSync(outPath, JSON.stringify(formattedJSON, null, 2), 'utf8');
      }

      const successful = resultsArray.filter(r => !r.error).length;
      const failed = resultsArray.length - successful;

      console.log(`\nSuccess: Exported ${resultsArray.length} items in ${formatDuration(parseFloat(durationS))}.`);
      console.log(`- Succeeded: ${successful}`);
      console.log(`- Failed   : ${failed}`);
      console.log(`Done!`);

    } catch (err) {
      progressBar.stop();
      const durationS = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`\nScraping interrupted after ${formatDuration(parseFloat(durationS))}: ${err.message}`);
      process.exit(1);
    }
  });

// CLI command: list courses
program
  .command('courses')
  .description('List all available RGPV courses and their IDs')
  .action(() => {
    console.log('Available RGPV Courses for result extraction:\n');
    console.log(`  ${'ID'.padEnd(6)} | ${'Course Name'}`);
    console.log(`  ${'-'.repeat(6)}-|-${'-'.repeat(40)}`);
    Object.entries(courses).forEach(([id, c]) => {
      console.log(`  ${id.padEnd(6)} | ${c.name}`);
    });
    console.log('\nUse these IDs with the "-c" or "--course" option in "rgpv-fetch scrape".');
  });

// CLI command: search registered colleges
program
  .command('colleges')
  .description('List all registered colleges and their codes')
  .option('-s, --search <query>', 'Search colleges by name or city')
  .option('-c, --city <city>', 'Filter colleges by city name')
  .action((options) => {
    const search = options.search ? options.search.toLowerCase() : null;
    const cityFilter = options.city ? options.city.toLowerCase() : null;
    console.log('Registered Colleges (sorted by Code):\n');
    console.log(`  ${'Code'.padEnd(6)} | ${'College Name'.padEnd(50)} | ${'City'}`);
    console.log(`  ${'-'.repeat(6)}-|-${'-'.repeat(50)}-|-${'-'.repeat(15)}`);

    const sortedColleges = Object.entries(colleges).sort((a, b) => a[0].localeCompare(b[0]));
    let count = 0;

    sortedColleges.forEach(([code, c]) => {
      const name = c.name || '';
      const city = c.city || '';
      
      const matchesSearch = !search || name.toLowerCase().includes(search) || city.toLowerCase().includes(search);
      const matchesCity = !cityFilter || city.toLowerCase().includes(cityFilter);

      if (matchesSearch && matchesCity) {
        console.log(`  ${code.padEnd(6)} | ${name.padEnd(50).substring(0, 50)} | ${city}`);
        count++;
      }
    });

    console.log(`\nTotal colleges listed: ${count}`);
    if (!search && !cityFilter && count > 30) {
      console.log('\nTip: Use "rgpv-fetch colleges -s <query>" or "rgpv-fetch colleges -c <city>" to filter the colleges list.');
    }
  });

// CLI command: start local Express dashboard server
program
  .command('dashboard')
  .description('Start the local web dashboard for result mining and analytics')
  .option('-p, --port <port>', 'Port to run the dashboard server on', '3000')
  .action((options) => {
    const port = parseInt(options.port, 10) || 3000;
    const url = `http://localhost:${port}`;

    console.log('\n==================================================');
    console.log('⚡ RGPV Fetch Dashboard');
    console.log(`URL: ${url}`);
    console.log('==================================================\n');
    console.log('Starting local Express server...');

    process.env.PORT = String(port);

    import('../web/server.js').then(() => {
      console.log('Opening dashboard in browser...');
      const startCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${startCommand} ${url}`, (err) => {
        // Silent catch
      });
    });
  });

program.parse(process.argv);
