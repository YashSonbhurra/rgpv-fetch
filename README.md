# rgpv-fetch

A pure-JavaScript scraper library, Command Line Interface (CLI), and Web Dashboard for fetching, scraping, and analyzing student results in bulk **across all colleges affiliated with Rajiv Gandhi Proudyogiki Vishwavidyalaya (RGPV)**. 

Because the results for all RGPV-affiliated colleges are published centrally on the official RGPV portal (result.rgpv.ac.in), this tool is capable of fetching and parsing results for students from any of its hundreds of affiliated institutions (such as LNCT, Oriental, TIT, IPS Academy, etc.) simply by using their standard enrollment numbers.

---

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Installation & Execution](#installation--execution)
- [Usage](#usage)
  - [As a Command Line Interface (CLI)](#as-a-command-line-interface-cli)
  - [As a Web Dashboard](#as-a-web-dashboard)
  - [As a Library (API)](#as-a-library-api)
- [Contributing & Testing (Help Wanted!)](#contributing--testing-help-wanted)
- [Disclaimer & Terms of Use](#disclaimer--terms-of-use)
- [License](#license)

---

## Features

- 🚀 **Bulk Fetching:** Scrape results for entire branches, batches, or whole colleges affiliated to RGPV simultaneously.
- 🧩 **Local Captcha Solving:** OCR solving with no external API charges or dependencies.
- 💾 **Smart Cache:** Saves fetched results locally in `~/.cache/rgpv-fetch/` to minimize hits to the RGPV servers.
- 📊 **Rich Export Options:** Export student results directly into **Excel (.xlsx)**, **CSV**, or **JSON** formats.
- 💻 **Web Analytics Dashboard:** Features a modern, beautiful local web dashboard (served via Express.js) containing various useful statistics.

> 💡 **Note on Live Fetching:** This tool fetches results from the RGPV portal in real-time. Because the university eventually removes older semester results from the official website, they can only be fetched if they are still available online, or if they have already been cached locally.

---

## Project Structure

The project has a modular layout separating core scraping logic, CLI bindings, and the web interface:

```text
rgpv-fetch/
├── package.json           # Project manifest, CLI binaries and dependency config
└── src/
    ├── cli/
    │   └── index.js       # CLI entrypoint (Commander.js commands & exports setup)
    ├── lib/
    │   ├── colleges.json  # Mapping of college codes
    │   ├── courses.json   # Mapping of course codes
    │   ├── index.js       # Main exports for importing as library
    │   └── scraper.js     # Core scraper engines, captcha preprocessing, and HTML parsers
    └── web/
        ├── server.js      # Express server handling dashboard endpoints
        └── public/        # Frontend assets (HTML, CSS, JS) for local analytics UI
```

---

## Installation & Execution

Ensure you have [Node.js](https://nodejs.org/) installed (v16.0.0 or higher is recommended, ES Modules support required).

### 1. Run without Installation (Using npx)
The quickest way to run the CLI is via `npx`, which allows you to run commands directly without downloading or installing them globally:
```bash
# Run a scrape job
npx rgpv-fetch scrape -s 3 -r 0176AL231001-060

# Start the dashboard
npx rgpv-fetch dashboard
```

### 2. Global Installation (Optional)
If you prefer to install the CLI globally so that the `rgpv-fetch` binary is directly available in your shell path:
```bash
npm install -g rgpv-fetch
```
Once installed, you can use the commands directly without `npx`:
```bash
rgpv-fetch scrape -s 3 -r 0176AL231001-060
```

### 3. Local Installation (For Library API Use)
To integrate the scraper directly into your own codebase as an imported module:
```bash
npm install rgpv-fetch
```

---

## Usage

> 💡 **TIP:** If you chose not to install the CLI globally, simply prefix all command examples below with `npx` (e.g., `npx rgpv-fetch scrape ...`).

### As a Command Line Interface (CLI)

Use the CLI to scrape results, list courses, search colleges, or run the web dashboard.

#### 1. Scrape Results (`scrape`)
Scrape results for a single student or a range of enrollment numbers.

```bash
# Scrape B.Tech (course ID 24) Sem 3 for a range of roll numbers (automatic output to XLSX)
rgpv-fetch scrape -s 3 -r 0176AL231001-160

# Scrape with custom Excel output file
rgpv-fetch scrape -s 3 -r 0176AL231001-160 -o ./results.xlsx

# Save to CSV or JSON formats based on output file extension
rgpv-fetch scrape -s 3 -r 0176AL231001-160 -o ./batch_results.csv
rgpv-fetch scrape -s 3 -r 0176AL231001-160 -o ./batch_results.json

# Scrape other courses (B.Arch, M.Tech, etc.) using its Course ID
rgpv-fetch scrape -c 11 -s 1 -r 0103AR241001-020

# Disable caches and fetch fresh results directly from server
rgpv-fetch scrape -s 3 -r 0176AL231001-160 --no-cache
```

**Options:**
- `-c, --course <courseId>`: Course ID (default: `24` for B.Tech). Run `rgpv-fetch courses` for a list of available IDs.
- `-s, --sem <semester>`: (Required) Semester number (e.g., `3`).
- `-r, --roll <rollNumbers>`: (Required) Enrollment list or range. E.g., `0176AL231001-060` or `0176AL231001,0176AL231005,0176AL231008`.
- `-o, --out <filePath>`: Path to export (JSON, CSV, or XLSX). Defaults to `./RGPV_[College]_[Sem]_[Branch].xlsx`.
- `--no-cache`: Force the program to skip cache files and query the server.
- `--concurrency <threads>`: Number of parallel worker queues running concurrently (default: `6`).
- `--delay <ms>`: Delay interval (in milliseconds) between request batches to avoid server overloading (default: `5000`).
- `--stagger-delay <ms>`: Startup staggering interval for worker threads (default: `900`).
- `--retries <count>`: Number of network retry attempts for failed HTTP request calls (default: `2`).

---

#### 2. View Supported Courses (`courses`)
Lists all available RGPV courses and their corresponding IDs.
```bash
rgpv-fetch courses
```

#### 3. Search College Codes (`colleges`)
Lists and searches registered college names, codes, and cities.
```bash
# List all colleges
rgpv-fetch colleges

# Search for specific colleges by name or city
rgpv-fetch colleges -s "LNCT"

# Filter colleges by a specific city
rgpv-fetch colleges -c "Bhopal"
```

#### 4. Run the Web Dashboard (`dashboard`)
Spawns the local dashboard server and automatically opens it in your web browser.
```bash
# Start dashboard on default port (3000)
rgpv-fetch dashboard

# Run on a custom port
rgpv-fetch dashboard --port 8080
```

---

### As a Web Dashboard

When you launch the dashboard command, you will have access to a visual web UI (`http://localhost:3000`) where you can:
- Perform bulk result fetches using interactive forms.
- Monitor scrape progress with dynamic progress bars.
- Inspect detailed class metrics, subject grade distributions, pass/fail ratios, and SGPA/CGPA averages.
- Search and filter scraped records inside an interactive data table.
- Export finalized datasets back to CSV, JSON, or Excel.

---

### As a Library (API)

You can import `rgpv-fetch` as an ES Module in your Node.js applications:

```javascript
import { RgpvFetch } from 'rgpv-fetch';

async function main() {
  // Initialize instance with options
  const scraper = new RgpvFetch({
    concurrency: 4,      // Number of concurrent scrapers
    delay: 5000,          // Delay in ms before making the request
    useCache: true,      // Set false to bypass loading/saving to local file cache
    cacheDuration: 86400 * 1000 // Cache expiration duration (e.g. 24 hours)
  });

  try {
    // You MUST initialize the Tesseract OCR worker before executing calls
    await scraper.init();

    // Fetch a single student's result
    // Parameters: getResult(enrollId, semester, courseId, resultType = 'main')
    const studentResult = await scraper.getResult('0176AL231001', 3, '24');
    
    if (studentResult.error) {
      console.log(`Failed to fetch student: ${studentResult.error}`);
    } else {
      console.log(`Name: ${studentResult.name}`);
      console.log(`SGPA: ${studentResult.sgpa}`);
      console.log(`Subjects:`, studentResult.subjects);
    }

    // Fetch bulk results with progress callbacks
    const enrollIds = ['0176AL231001', '0176AL231002', '0176AL231003'];
    const bulkResults = await scraper.getBulkResults(enrollIds, 3, '24', (progress) => {
      console.log(`Progress: ${progress.current}/${progress.total} | Scraped: ${progress.enrollId} [${progress.status}]`);
    });

    console.log(`Successfully completed bulk fetch:`, Object.keys(bulkResults).length, 'records');

  } catch (error) {
    console.error(`An error occurred:`, error);
  } finally {
    // 4. Always close and terminate worker resources when finished
    await scraper.close();
  }
}

main();
```

---

## Contributing & Testing (Help Wanted!)

> ⚠️ **WARNING:** The parsing layout engines are extensively tested and optimized for B.Tech course only (Course ID `24`).
>
> Scraping and parsing B.Pharmacy, M.Tech, MCA, Diploma, or any other courses **might be buggy, return parsed errors, or fail completely** if their result sheets use different HTML formats.

I warmly invite you to help expand the compatibility of this scraper!
- **Test Other Courses:** Run the scraper on courses such as M.Tech, B.Pharma, MCA, etc., and let me know if something fails.
- **Report Issues:** If you encounter parsing errors (e.g., failed subject grades, empty fields, or "Failed to parse result page layout" errors), please open an issue and include the HTML structure of the result page.
- **Submit PRs:** If you patch layout parsers in `scraper.js` to support additional course templates, feel free to submit a pull request!

---

## Disclaimer & Terms of Use

**RGPV Fetch** is an independent academic analysis dashboard. All data displayed or retrieved is parsed in real-time on an **"as-is" and "as-available"** basis directly from the official Rajiv Gandhi Proudyogiki Vishwavidyalaya (RGPV) website at [rgpv.ac.in](https://rgpv.ac.in). It is intended strictly for informational, educational, and statistical purposes.

- **No Official Affiliation:** This tool is entirely open-source and has no official affiliation, authorization, association, endorsement, or connection of any kind with Rajiv Gandhi Proudyogiki Vishwavidyalaya (RGPV), its governing boards, or any affiliated institutions.
- **Subject to Change & Errors:** The parsed result sheets are subject to web formatting alterations, scraper connection timeouts, or transcription discrepancies. The developers cannot guarantee the completeness, accuracy, or up-to-date status of the parsed metrics.
- **Primary Source Referral:** This dashboard is not a replacement for official university documents. For any official, legal, academic, or administrative requirements, users must refer exclusively to the official RGPV portal or request official printed transcripts from the university registrar.
- **Disclaimer of Liability:** Under no circumstances shall the author, developers, or contributors of RGPV Fetch be held liable for any direct, indirect, incidental, or consequential damages, errors, discrepancies, or losses arising from the use of this software, server downtime, or reliance on the analytics presented herein.


---

## License

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.
