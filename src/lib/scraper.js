import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import Jimp from 'jimp';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coursesPath = path.resolve(__dirname, 'courses.json');
const courses = JSON.parse(fs.readFileSync(coursesPath, 'utf8'));

const BASE_URL = 'http://result.rgpv.ac.in';

export class RgpvFetch {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 2;
    this.delay = options.delay ?? 5000;
    this.cachePath = options.cachePath ?? path.resolve(os.homedir(), '.cache', 'rgpv-fetch');
    this.useCache = options.useCache ?? true;
    this.cacheDuration = options.cacheDuration ?? 86400 * 1000;
    this.concurrency = options.concurrency ?? 4;
    this.staggerDelay = options.staggerDelay ?? 1000;
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.jar,
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      }
    }));
    this.worker = null;
    this.redirectUrls = {};
    this.currentCourseId = null;
    this.stopped = false;
  }

  // Initializes Tesseract OCR worker
  async init() {
    if (!this.worker) {
      this.worker = await createWorker('eng');
      await this.worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        tessedit_pageseg_mode: '8'
      });
    }
  }

  // Closes Tesseract OCR worker and cleans up resources
  async close() {
    this.stopped = true;
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  // Ensures session is initialized and selected for a specific course ID
  async _ensureSession(courseId) {
    const courseIdStr = String(courseId);
    if (this.currentCourseId === courseIdStr && this.redirectUrls[courseIdStr]) {
      return this.redirectUrls[courseIdStr];
    }

    const getProg = await this.client.get(`${BASE_URL}/result/programselect.aspx?id=$%`);
    const $ = cheerio.load(getProg.data);
    const viewstate = $('#__VIEWSTATE').val();
    const generator = $('#__VIEWSTATEGENERATOR').val();
    const validation = $('#__EVENTVALIDATION').val();

    if (!viewstate) {
      throw new Error('Failed to load ProgramSelect.aspx state');
    }

    const selectData = new URLSearchParams();
    selectData.append('__EVENTARGUMENT', '');
    selectData.append('__LASTFOCUS', '');
    selectData.append('__VIEWSTATE', viewstate);
    selectData.append('__VIEWSTATEGENERATOR', generator);
    selectData.append('__EVENTVALIDATION', validation);
    selectData.append('__EVENTTARGET', 'radlstProgram$1');
    selectData.append('radlstProgram', courseIdStr);

    const postProg = await this.client.post(`${BASE_URL}/Result/ProgramSelect.aspx`, selectData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BASE_URL}/result/programselect.aspx?id=$%`
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const redirectSoup = cheerio.load(postProg.data);
    const linkTag = redirectSoup('a');
    if (linkTag.length === 0) {
      throw new Error(`Failed to extract redirect URL for course ID: ${courseIdStr}`);
    }

    const href = decodeURIComponent(linkTag.attr('href'));
    const redirectUrl = href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`;

    this.currentCourseId = courseIdStr;
    this.redirectUrls[courseIdStr] = redirectUrl;

    return redirectUrl;
  }

  // Retrieves cached result for a key
  _getCache(key) {
    if (!this.useCache) return null;
    try {
      const file = path.resolve(this.cachePath, `${key}.json`);
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const cached = JSON.parse(content);
        if (Date.now() - cached.timestamp < this.cacheDuration) {
          return cached.data;
        } else {
          fs.unlinkSync(file);
        }
      }
    } catch (err) {
      // Fail silently
    }
    return null;
  }

  // Pause execution helper
  _sleep(ms) {
    if (this.stopped) return Promise.resolve();
    const start = Date.now();
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this.stopped || (Date.now() - start) >= ms) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  // Preprocesses captcha image using Jimp (sharpening + thresholding) and solves it via Tesseract
  async solveCaptcha(imageBuffer) {
    await this.init();

    const image = await Jimp.read(imageBuffer);
    const sharpenKernel = [
      [ 0, -1,  0],
      [-1,  5, -1],
      [ 0, -1,  0]
    ];

    // Preprocessing pipeline: Greyscale -> Invert -> Sharpen -> Resize 2x
    image.greyscale()
         .invert()
         .convolute(sharpenKernel)
         .resize(image.bitmap.width * 2, image.bitmap.height * 2);

    // Apply custom threshold filter (128 threshold value)
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
      const red = this.bitmap.data[idx];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];
      const gray = (red + green + blue) / 3;
      const v = gray < 128 ? 0 : 255;
      this.bitmap.data[idx] = v;
      this.bitmap.data[idx + 1] = v;
      this.bitmap.data[idx + 2] = v;
    });

    const processedBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
    const { data: { text } } = await this.worker.recognize(processedBuffer);
    return text.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
  }

  // Fetches result for a single student using a specific Axios client
  async _getResultWithClient(client, pageUrl, canonicalEnrollId, semStr, courseId, cacheKey) {
    let systemAttempts = 0;

    while (true) {
      if (this.stopped) throw new Error('Scrape job aborted');
      try {
        const getRes = await client.get(pageUrl);
        if (this.stopped) throw new Error('Scrape job aborted');
        const $ = cheerio.load(getRes.data);

        const viewstate = $('#__VIEWSTATE').val();
        const generator = $('#__VIEWSTATEGENERATOR').val();
        const validation = $('#__EVENTVALIDATION').val();

        if (!viewstate) {
          throw new Error('Failed to load page state (__VIEWSTATE is missing)');
        }

        let captchaSrc = $('img[src*="CaptchaImage"]').attr('src') || $('img[id*="ImageButton1"]').attr('src');
        if (!captchaSrc) {
          const imgTags = $('img');
          if (imgTags.length > 1) {
            captchaSrc = $(imgTags[1]).attr('src');
          }
        }

        if (!captchaSrc) {
          throw new Error('Captcha image not found in the page');
        }

        const captchaUrl = `${BASE_URL}/Result/${captchaSrc.replace(/^\.\.\//, '')}`;

        if (this.stopped) throw new Error('Scrape job aborted');
        const imgRes = await client.get(captchaUrl, { responseType: 'arraybuffer' });
        if (this.stopped) throw new Error('Scrape job aborted');
        const captchaText = await this.solveCaptcha(Buffer.from(imgRes.data));
        if (this.stopped) throw new Error('Scrape job aborted');

        if (captchaText.length !== 5 && String(courseId) !== '11') {
          // Standard captcha length is 5. Skip POST if solver returned wrong length (captcha error -> retry indefinitely)
          continue;
        }

        await this._sleep(this.delay);
        if (this.stopped) throw new Error('Scrape job aborted');

        const postData = new URLSearchParams();
        postData.append('__VIEWSTATE', viewstate);
        postData.append('__VIEWSTATEGENERATOR', generator);
        postData.append('__EVENTVALIDATION', validation);
        postData.append('__EVENTTARGET', '');
        postData.append('__EVENTARGUMENT', '');
        postData.append('ctl00$ContentPlaceHolder1$txtrollno', canonicalEnrollId);
        postData.append('ctl00$ContentPlaceHolder1$drpSemester', semStr);
        postData.append('ctl00$ContentPlaceHolder1$rbtnlstSType', 'G');
        postData.append('ctl00$ContentPlaceHolder1$TextBox1', captchaText);
        postData.append('ctl00$ContentPlaceHolder1$btnviewresult', 'View Result');

        const postRes = await client.post(pageUrl, postData.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': pageUrl
          }
        });
        if (this.stopped) throw new Error('Scrape job aborted');

        const resPage = cheerio.load(postRes.data);
        const htmlText = postRes.data;

        if (htmlText.includes('you have entered a wrong text')) {
          continue;
        }

        if (htmlText.includes('Result for this Enrollment No. not Found') || 
            htmlText.includes('Enrollment No not Found') || 
            htmlText.includes('Enrollment No. not Found')) {
          
          systemAttempts++;
          if (systemAttempts >= this.maxRetries) {
            const result = { error: 'Enrollment No not Found', enrollId: canonicalEnrollId };
            this._cacheResult(cacheKey, result);
            return result;
          }
          continue;
        }

        const btnViewResult = resPage('#ctl00_ContentPlaceHolder1_btnviewresult');
        if (btnViewResult.length > 0) {
          continue;
        }

        const parsedData = this._parseResultPage(resPage, canonicalEnrollId);
        if (parsedData) {
          this._cacheResult(cacheKey, parsedData);
          return parsedData;
        }

        throw new Error('Failed to parse result page layout');
      } catch (err) {
        if (this.stopped || err.message === 'Scrape job aborted') {
          throw err;
        }
        systemAttempts++;
        if (systemAttempts >= this.maxRetries) {
          throw new Error(`Scraping failed after ${this.maxRetries} system attempts. Last error: ${err.message}`);
        }
      }
    }
  }

  // Fetches result for a single student (with automatic captcha retries)
  async getResult(enrollId, semester, courseId, resultType = 'main') {
    const canonicalEnrollId = enrollId.toUpperCase().trim();
    const semStr = String(semester);
    
    const course = courses[String(courseId)];
    if (!course) {
      throw new Error(`Invalid courseId: ${courseId}. Available courseIds: ${Object.keys(courses).join(', ')}`);
    }

    const cacheKey = `${canonicalEnrollId}_${semStr}_${resultType}`;
    
    const cachedData = this._getCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const pageUrl = await this._ensureSession(courseId);
    return this._getResultWithClient(this.client, pageUrl, canonicalEnrollId, semStr, courseId, cacheKey);
  }

  // Caches a result to a file (minified)
  _cacheResult(key, data) {
    if (!this.useCache) return;
    try {
      if (!fs.existsSync(this.cachePath)) {
        fs.mkdirSync(this.cachePath, { recursive: true });
      }
      const file = path.resolve(this.cachePath, `${key}.json`);
      const payload = {
        timestamp: Date.now(),
        data
      };
      fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
    } catch (err) {
      // Fail silently
    }
  }

  // Parses HTML layout of the results page (supports Grading and Non-Grading formats)
  _parseResultPage($, enrollId) {
    const studentNameGrading = $('#ctl00_ContentPlaceHolder1_lblNameGrading').text().trim().replace(/\s+/g, ' ');
    const studentNameNonGrading = $('#ctl00_ContentPlaceHolder1_lblName').text().trim().replace(/\s+/g, ' ');
    const name = studentNameGrading || studentNameNonGrading;

    if (!name) {
      return null;
    }

    const hasGrading = $('#ctl00_ContentPlaceHolder1_pnlGrading').length > 0;
    const hasNonGrading = $('#ctl00_ContentPlaceHolder1_pnlNonGrading').length > 0;

    const result = {
      enrollId,
      name,
      status: '',
      subjects: []
    };

    if (hasGrading) {
      result.format = 'grading';
      result.status = $('#ctl00_ContentPlaceHolder1_lblResultNewGrading').text().trim().replace(/\s+/g, ' ');
      result.sgpa = $('#ctl00_ContentPlaceHolder1_lblSGPA').text().trim().replace(/\s+/g, ' ');
      result.cgpa = $('#ctl00_ContentPlaceHolder1_lblcgpa').text().trim().replace(/\s+/g, ' ');

      const gradingTables = $('#ctl00_ContentPlaceHolder1_pnlGrading').find('tr').eq(6).find('table');
      gradingTables.each((_, table) => {
        const tdList = $(table).find('td');
        if (tdList.length >= 4) {
          const subject = $(tdList[0]).text().trim().replace(/\s+/g, '');
          const grade = $(tdList[3]).text().trim().replace(/\s+/g, ' ');
          if (subject && grade) {
            result.subjects.push({ subject, grade });
          }
        }
      });
    } else if (hasNonGrading) {
      result.format = 'non-grading';
      result.status = $('#ctl00_ContentPlaceHolder1_lblResult').text().trim().replace(/\s+/g, ' ');
      result.totalMarks = $('#ctl00_ContentPlaceHolder1_lblTotal').text().trim().replace(/\s+/g, ' ');
      
      const rows = $('#ctl00_ContentPlaceHolder1_pnlNonGrading').find('tr');
      rows.each((i, tr) => {
        if (i === 0) return;
        const tdList = $(tr).find('td');
        if (tdList.length >= 5) {
          const subjectCode = $(tdList[0]).text().trim().replace(/\s+/g, '');
          const subjectName = $(tdList[1]).text().trim().replace(/\s+/g, ' ');
          const theoryMarks = $(tdList[2]).text().trim().replace(/\s+/g, ' ');
          const practicalMarks = $(tdList[3]).text().trim().replace(/\s+/g, ' ');
          const total = $(tdList[4]).text().trim().replace(/\s+/g, ' ');

          if (subjectCode) {
            result.subjects.push({
              subjectCode,
              subjectName,
              theoryMarks,
              practicalMarks,
              total
            });
          }
        }
      });
    } else {
      result.format = 'unknown';
      result.status = 'Unknown Format - Result page layout not recognized';
    }

    return result;
  }

  // Bulk results scraper (concurrent session worker queues)
  async getBulkResults(enrollIds, semester, courseId, onProgress = null, lateralConfig = null) {
    const results = {};
    const semStr = String(semester);
    this.stopped = false;

    const prefixConfig = {};
    for (const item of enrollIds) {
      const canonical = item.toUpperCase().trim();
      if (canonical.endsWith('-')) {
        const baseId = canonical.slice(0, -1);
        const prefix = baseId.substring(0, 9);
        const startSeq = parseInt(baseId.substring(9), 10);
        if (!prefixConfig[prefix]) {
          prefixConfig[prefix] = {
            prefix,
            startSeq,
            maxSeq: Infinity,
            isQueryOpenEnded: true,
            nextSeq: startSeq,
            stopTriggered: false,
            finishedSeqs: {}
          };
        }
      } else {
        const prefix = canonical.substring(0, 9);
        const seq = parseInt(canonical.substring(9), 10);
        if (!prefixConfig[prefix]) {
          prefixConfig[prefix] = {
            prefix,
            startSeq: seq,
            maxSeq: seq,
            isQueryOpenEnded: false,
            nextSeq: seq,
            stopTriggered: false,
            finishedSeqs: {}
          };
        } else {
          prefixConfig[prefix].startSeq = Math.min(prefixConfig[prefix].startSeq, seq);
          prefixConfig[prefix].maxSeq = Math.max(prefixConfig[prefix].maxSeq, seq);
          prefixConfig[prefix].nextSeq = Math.min(prefixConfig[prefix].nextSeq, seq);
        }
      }
    }

    let completedCount = 0;

    for (const pref of Object.values(prefixConfig)) {
      if (pref.isQueryOpenEnded) {
        continue;
      }
      
      for (let seq = pref.startSeq; seq <= pref.maxSeq; seq++) {
        if (this.stopped) break;
        const enrollId = `${pref.prefix}${String(seq).padStart(3, '0')}`;
        const cacheKey = `${enrollId}_${semStr}_main`;
        const cachedData = this._getCache(cacheKey);
        
        if (cachedData) {
          results[enrollId] = cachedData;
          completedCount++;
          pref.finishedSeqs[seq] = { status: 'success', data: cachedData };
        }
      }
    }

    if (this.stopped) return results;

    await this.init();

    const clients = Array.from({ length: this.concurrency }, () => {
      const jar = new CookieJar();
      return wrapper(axios.create({
        jar,
        withCredentials: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive'
        }
      }));
    });

    const redirectUrls = Array.from({ length: this.concurrency }, () => null);
    const currentCourseIds = Array.from({ length: this.concurrency }, () => null);
    const hasOpenEnded = Object.values(prefixConfig).some(p => p.isQueryOpenEnded);

    // Calculates current active/estimated total matching sequence config
    const getProgressTotal = () => {
      let sum = 0;
      Object.values(prefixConfig).forEach(p => {
        if (p.maxSeq === Infinity) {
          sum += Math.max(completedCount + 20, 100);
        } else {
          sum += (p.maxSeq - p.startSeq + 1);
        }
      });
      return sum;
    };

    let stoppedAll = false;

    const checkStopConditionForPrefix = (pref) => {
      let currentSeq = pref.startSeq;
      let consec = 0;
      let stopSeq = -1;

      while (true) {
        const resObj = pref.finishedSeqs[currentSeq];
        if (!resObj) {
          break;
        }

        const isNotFound = resObj.status === 'error' && (
          resObj.error === 'Enrollment No not Found' ||
          resObj.error?.includes('not Found')
        );

        if (isNotFound) {
          consec++;
          if (consec >= 5) {
            stopSeq = currentSeq;
            break;
          }
        } else {
          consec = 0;
        }
        currentSeq++;
      }

      if (stopSeq !== -1) {
        pref.stopTriggered = true;
        const firstFailureSeq = stopSeq - 4;
        
        Object.keys(pref.finishedSeqs).forEach(keySeqStr => {
          const keySeq = parseInt(keySeqStr, 10);
          if (keySeq > firstFailureSeq) {
            const badEnrollId = `${pref.prefix}${String(keySeq).padStart(3, '0')}`;
            delete results[badEnrollId];
            delete pref.finishedSeqs[keySeq];
          }
        });
      }
    };

    // Parallel queue worker thread implementation
    const worker = async (workerId) => {
      // Roulette Staggered Startup: start staggered apart to distribute resource consumption
      if (workerId > 0 && !this.stopped && this.staggerDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, workerId * this.staggerDelay));
      }
      if (this.stopped) return;

      const client = clients[workerId];

      const ensureClientSession = async () => {
        const cIdStr = String(courseId);
        if (currentCourseIds[workerId] === cIdStr && redirectUrls[workerId]) {
          return redirectUrls[workerId];
        }

        const getProg = await client.get(`${BASE_URL}/result/programselect.aspx?id=$%`);
        const $ = cheerio.load(getProg.data);
        const viewstate = $('#__VIEWSTATE').val();
        const generator = $('#__VIEWSTATEGENERATOR').val();
        const validation = $('#__EVENTVALIDATION').val();

        if (!viewstate) {
          throw new Error('Failed to load ProgramSelect.aspx state');
        }

        const selectData = new URLSearchParams();
        selectData.append('__EVENTARGUMENT', '');
        selectData.append('__LASTFOCUS', '');
        selectData.append('__VIEWSTATE', viewstate);
        selectData.append('__VIEWSTATEGENERATOR', generator);
        selectData.append('__EVENTVALIDATION', validation);
        selectData.append('__EVENTTARGET', 'radlstProgram$1');
        selectData.append('radlstProgram', cIdStr);

        const postProg = await client.post(`${BASE_URL}/Result/ProgramSelect.aspx`, selectData.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': `${BASE_URL}/result/programselect.aspx?id=$%`
          },
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400
        });

        const redirectSoup = cheerio.load(postProg.data);
        const linkTag = redirectSoup('a');
        if (linkTag.length === 0) {
          throw new Error(`Failed to extract redirect URL for course ID: ${cIdStr}`);
        }

        const href = decodeURIComponent(linkTag.attr('href'));
        const redirectUrl = href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`;

        currentCourseIds[workerId] = cIdStr;
        redirectUrls[workerId] = redirectUrl;
        return redirectUrl;
      };

      while (!stoppedAll && !this.stopped) {
        let task = null;
        for (const pref of Object.values(prefixConfig)) {
          if (pref.stopTriggered || this.stopped) continue;
          
          let found = false;
          while (pref.nextSeq <= pref.maxSeq) {
            const seq = pref.nextSeq++;
            if (!pref.finishedSeqs[seq]) {
              const enrollId = `${pref.prefix}${String(seq).padStart(3, '0')}`;
              task = { pref, seq, enrollId };
              found = true;
              break;
            }
          }
          if (found) break;
        }

        if (!task || this.stopped) {
          break;
        }

        const { pref, seq, enrollId } = task;
        const cacheKey = `${enrollId}_${semStr}_main`;

        if (pref.isQueryOpenEnded) {
          const cachedData = this._getCache(cacheKey);
          if (cachedData) {
            results[enrollId] = cachedData;
            completedCount++;
            pref.finishedSeqs[seq] = { status: 'success', data: cachedData };
            
            if (onProgress) {
              onProgress({
                current: completedCount,
                total: getProgressTotal(),
                isOpenEnded: hasOpenEnded,
                enrollId,
                status: 'success',
                data: cachedData,
                message: `Successfully loaded from cache: ${enrollId}`
              });
            }
            checkStopConditionForPrefix(pref);
            continue;
          }
        }

        try {
          if (onProgress) {
            onProgress({
              current: completedCount + 1,
              total: getProgressTotal(),
              isOpenEnded: hasOpenEnded,
              enrollId,
              status: 'scraping',
              message: `Scraping result for ${enrollId}`
            });
          }

          const pageUrl = await ensureClientSession();
          if (this.stopped) break;
          const data = await this._getResultWithClient(client, pageUrl, enrollId, semStr, courseId, cacheKey);
          
          if (stoppedAll || pref.stopTriggered || this.stopped) break;

          results[enrollId] = data;
          completedCount++;

          const isError = !!data.error;
          pref.finishedSeqs[seq] = { status: isError ? 'error' : 'success', data, error: data.error };

          if (onProgress) {
            onProgress({
              current: completedCount,
              total: getProgressTotal(),
              isOpenEnded: hasOpenEnded,
              enrollId,
              status: isError ? 'error' : 'success',
              data: isError ? undefined : data,
              error: isError ? data.error : undefined,
              message: isError ? `Failed to scrape ${enrollId}: ${data.error}` : `Successfully scraped ${enrollId}`
            });
          }

          checkStopConditionForPrefix(pref);
        } catch (err) {
          if (stoppedAll || pref.stopTriggered || this.stopped) break;

          const errRecord = { error: err.message, enrollId };
          results[enrollId] = errRecord;
          completedCount++;

          pref.finishedSeqs[seq] = { status: 'error', data: errRecord, error: err.message };

          if (onProgress) {
            onProgress({
              current: completedCount,
              total: getProgressTotal(),
              isOpenEnded: hasOpenEnded,
              enrollId,
              status: 'error',
              error: err.message,
              message: `Failed to scrape ${enrollId}: ${err.message}`
            });
          }

          checkStopConditionForPrefix(pref);
        }
      }
    };

    const activeTasksCount = Object.values(prefixConfig).reduce((sum, p) => sum + (p.maxSeq === Infinity ? 100 : (p.maxSeq - p.startSeq + 1)), 0);
    const spawnCount = Math.min(this.concurrency, activeTasksCount);
    
    if (spawnCount > 0 && !this.stopped) {
      const workerPromises = Array.from({ length: spawnCount }, (_, i) => worker(i));
      await Promise.all(workerPromises);
    }

    // Pass 2: Lateral Entries
    if (lateralConfig && lateralConfig.includeLateral && lateralConfig.range && !this.stopped) {
      if (parseInt(semester, 10) >= 3) {
        try {
          const prefixes = [];
          Object.values(prefixConfig).forEach(pref => {
            prefixes.push({
              clg: pref.prefix.substring(0, 4),
              branch: pref.prefix.substring(4, 6),
              regYear: parseInt(pref.prefix.substring(6, 8), 10)
            });
          });

          const rangeParts = lateralConfig.range.split('-');
          if (rangeParts.length === 2 && prefixes.length > 0) {
            const latStart = parseInt(rangeParts[0].trim(), 10);
            const latEnd = parseInt(rangeParts[1].trim(), 10);
            
            if (!isNaN(latStart) && !isNaN(latEnd)) {
              const minLat = Math.min(latStart, latEnd);
              const maxLat = Math.max(latStart, latEnd);
              
              const lateralIds = [];
              for (const pref of prefixes) {
                const lateralYear = String((pref.regYear + 1) % 100).padStart(2, '0');
                for (let i = minLat; i <= maxLat; i++) {
                  const seqStr = String(i).padStart(2, '0');
                  lateralIds.push(`${pref.clg}${pref.branch}${lateralYear}3D${seqStr}`);
                }
              }
              
              if (lateralIds.length > 0 && !this.stopped) {
                let nextLatTaskIndex = 0;
                const regularCompleted = completedCount;
                const newTotal = regularCompleted + lateralIds.length;
                
                if (onProgress) {
                  onProgress({
                    current: regularCompleted,
                    total: newTotal,
                    enrollId: 'Lateral Init...',
                    status: 'scraping',
                    message: 'Starting lateral entries fetch...'
                  });
                }
                
                const latWorker = async (workerId) => {
                  // Roulette Staggered Startup: start staggered apart to distribute resource consumption
                  if (workerId > 0 && !this.stopped && this.staggerDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, workerId * this.staggerDelay));
                  }
                  if (this.stopped) return;

                  const client = clients[workerId] || clients[0];
                  
                  const ensureClientSession = async () => {
                    const cIdStr = String(courseId);
                    if (currentCourseIds[workerId] === cIdStr && redirectUrls[workerId]) {
                      return redirectUrls[workerId];
                    }

                    const getProg = await client.get(`${BASE_URL}/result/programselect.aspx?id=$%`);
                    const $ = cheerio.load(getProg.data);
                    const viewstate = $('#__VIEWSTATE').val();
                    const generator = $('#__VIEWSTATEGENERATOR').val();
                    const validation = $('#__EVENTVALIDATION').val();

                    if (!viewstate) {
                      throw new Error('Failed to load ProgramSelect.aspx state');
                    }

                    const selectData = new URLSearchParams();
                    selectData.append('__EVENTARGUMENT', '');
                    selectData.append('__LASTFOCUS', '');
                    selectData.append('__VIEWSTATE', viewstate);
                    selectData.append('__VIEWSTATEGENERATOR', generator);
                    selectData.append('__EVENTVALIDATION', validation);
                    selectData.append('__EVENTTARGET', 'radlstProgram$1');
                    selectData.append('radlstProgram', cIdStr);

                    const postProg = await client.post(`${BASE_URL}/Result/ProgramSelect.aspx`, selectData.toString(), {
                      headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': `${BASE_URL}/result/programselect.aspx?id=$%`
                      },
                      maxRedirects: 0,
                      validateStatus: (status) => status >= 200 && status < 400
                    });

                    const redirectSoup = cheerio.load(postProg.data);
                    const linkTag = redirectSoup('a');
                    if (linkTag.length === 0) {
                      throw new Error(`Failed to extract redirect URL for course ID: ${cIdStr}`);
                    }

                    const href = decodeURIComponent(linkTag.attr('href'));
                    const redirectUrl = href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`;

                    currentCourseIds[workerId] = cIdStr;
                    redirectUrls[workerId] = redirectUrl;
                    return redirectUrl;
                  };

                  while (!this.stopped) {
                    const taskIndex = nextLatTaskIndex++;
                    if (taskIndex >= lateralIds.length || this.stopped) {
                      break;
                    }
                    
                    const enrollId = lateralIds[taskIndex];
                    const cacheKey = `${enrollId}_${semStr}_main`;
                    
                    const cachedData = this._getCache(cacheKey);
                    if (cachedData) {
                      results[enrollId] = cachedData;
                      completedCount++;
                      if (onProgress) {
                        onProgress({
                          current: completedCount,
                          total: newTotal,
                          enrollId,
                          status: 'success',
                          data: cachedData,
                          message: `Successfully loaded lateral from cache: ${enrollId}`
                        });
                      }
                      continue;
                    }
                    
                    try {
                      if (onProgress) {
                        onProgress({
                          current: completedCount + 1,
                          total: newTotal,
                          enrollId,
                          status: 'scraping',
                          message: `Scraping lateral result for ${enrollId}`
                        });
                      }
                      
                      const pageUrl = await ensureClientSession();
                      if (this.stopped) break;
                      const data = await this._getResultWithClient(client, pageUrl, enrollId, semStr, courseId, cacheKey);
                      
                      if (this.stopped) break;
                      results[enrollId] = data;
                      completedCount++;
                      
                      const isError = !!data.error;
                      if (onProgress) {
                        onProgress({
                          current: completedCount,
                          total: newTotal,
                          enrollId,
                          status: isError ? 'error' : 'success',
                          data: isError ? undefined : data,
                          error: isError ? data.error : undefined,
                          message: isError ? `Failed to scrape lateral ${enrollId}: ${data.error}` : `Successfully scraped lateral ${enrollId}`
                        });
                      }
                    } catch (err) {
                      if (this.stopped) break;
                      const errRecord = { error: err.message, enrollId };
                      results[enrollId] = errRecord;
                      completedCount++;
                      if (onProgress) {
                        onProgress({
                          current: completedCount,
                          total: newTotal,
                          enrollId,
                          status: 'error',
                          error: err.message,
                          message: `Failed to scrape lateral ${enrollId}: ${err.message}`
                        });
                      }
                    }
                  }
                };
                
                const spawnCountLat = Math.min(this.concurrency, lateralIds.length);
                const workerPromisesLat = Array.from({ length: spawnCountLat }, (_, i) => latWorker(i));
                await Promise.all(workerPromisesLat);
              }
            }
          }
        } catch (latErr) {
          console.error("Error in lateral entries pass:", latErr.message);
        }
      }
    }

    await this.close();
    return results;
  }
}
