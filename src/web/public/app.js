document.addEventListener('DOMContentLoaded', () => {
  const scrapeForm = document.getElementById('scrapeForm');
  const courseSelect = document.getElementById('courseSelect');
  const semesterInput = document.getElementById('semesterInput');
  const concurrencyInput = document.getElementById('concurrencyInput');
  const staggerDelayInput = document.getElementById('staggerDelayInput');
  const collegeSelect = document.getElementById('collegeSelect');
  const yearInput = document.getElementById('yearInput');
  const branchInput = document.getElementById('branchInput');
  const rangeStartInput = document.getElementById('rangeStartInput');
  const rangeEndInput = document.getElementById('rangeEndInput');
  const rollInput = document.getElementById('rollInput');
  const inputModeBtns = document.querySelectorAll('#inputModeToggle .toggle-btn');
  const helperInputContainer = document.getElementById('helperInputContainer');
  const manualInputContainer = document.getElementById('manualInputContainer');
  const rangePreviewBadge = document.getElementById('rangePreviewBadge');
  const lateralGroupContainer = document.getElementById('lateralGroupContainer');
  const includeLateralCheckbox = document.getElementById('includeLateralCheckbox');
  const lateralRangeGroup = document.getElementById('lateralRangeGroup');
  const lateralRangeInput = document.getElementById('lateralRangeInput');
  const delayInput = document.getElementById('delayInput');
  const retriesInput = document.getElementById('retriesInput');
  const cacheCheckbox = document.getElementById('cacheCheckbox');
  const rememberSetupCheckbox = document.getElementById('rememberSetupCheckbox');

  const advTrigger = document.getElementById('advTrigger');
  const advContent = document.getElementById('advContent');

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resetBtn = document.getElementById('resetBtn');

  const statusIndicator = document.getElementById('statusIndicator');
  const statusLabel = document.getElementById('statusLabel');

  const progressCard = document.getElementById('progressCard');
  const progressPercent = document.getElementById('progressPercent');
  const progressCounts = document.getElementById('progressCounts');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressBarText = document.getElementById('progressBarText');

  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const tableBody = document.getElementById('tableBody');
  const tableHeadersRow = document.getElementById('tableHeadersRow');
  const resultsCount = document.getElementById('resultsCount');

  const exportQuickBtns = document.querySelectorAll('.btn-export-quick');
  const fontSelect = document.getElementById('fontSelect');
  const fontSizeSlider = document.getElementById('fontSizeSlider');
  const fontSizeDisplay = document.getElementById('fontSizeDisplay');
  const animationSelect = document.getElementById('animationSelect');
  const matrixBgToggle = document.getElementById('matrixBgToggle');
  const matrixSettingsContainer = document.getElementById('matrixSettingsContainer');
  const matrixIdleSizeSlider = document.getElementById('matrixIdleSizeSlider');
  const matrixIdleSizeDisplay = document.getElementById('matrixIdleSizeDisplay');
  const matrixActiveSizeSlider = document.getElementById('matrixActiveSizeSlider');
  const matrixActiveSizeDisplay = document.getElementById('matrixActiveSizeDisplay');
  const scannerUiToggle = document.getElementById('scannerUiToggle');

  const avgSgpaVal = document.getElementById('avgSgpaVal');
  const sgpaGaugeFill = document.getElementById('sgpaGaugeFill');
  const avgCgpaVal = document.getElementById('avgCgpaVal');
  const cgpaGaugeFill = document.getElementById('cgpaGaugeFill');
  const passRateVal = document.getElementById('passRateVal');
  const passGaugeFill = document.getElementById('passGaugeFill');
  const subjectsChartContainer = document.getElementById('subjectsChartContainer');
  const subjectSelect = document.getElementById('subjectSelect');

  const tallyPassedCount = document.getElementById('tallyPassedCount');
  const tallyGraceCount = document.getElementById('tallyGraceCount');
  const tallyFailedCount = document.getElementById('tallyFailedCount');

  const reportCardModal = document.getElementById('reportCardModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalReportContent = document.getElementById('modalReportContent');

  const disclaimerModal = document.getElementById('disclaimerModal');
  const disclaimerLink = document.getElementById('disclaimerLink');
  const closeDisclaimerBtn = document.getElementById('closeDisclaimerBtn');

  let coursesData = {};
  let globalCollegesData = {};
  let studentsResults = [];
  let activeBranchesList = [];
  let eventSource = null;
  let currentActiveTab = 'explorer';
  let currentSelectedSubject = '';
  let activeInputMode = 'visual';
  let activeJobCourseId = '';
  let activeJobSemester = '';
  let pendingSavedCollege = '';
  let pendingSavedCourse = '';
  const SETUP_STORAGE_KEY = 'rgpv_fetch_setup';
  let currentSortCol = 'enrollId';
  let currentSortDir = 'asc';
  let previousJobStatus = 'idle';
  let sfxPlayedForThisJob = false;

  const sfxConfirm = new Audio('sfx/funmode_are_you_sure_about_that.wav');
  const sfxSuccess = new Audio('sfx/funmode_hehe_boi.wav');
  const sfxCook = new Audio('sfx/funmode_let_him_cook_now.wav');
  const sfxFahh = new Audio('sfx/funmode_fahh.mp3');
  const sfxBye = new Audio('sfx/funmode_bye_have_a_great_time.mp3');

  // Global document interaction listener to unlock all Audio objects for autoplay
  function unlockAudioContexts() {
    const audios = [sfxConfirm, sfxSuccess, sfxCook, sfxFahh, sfxBye];
    const unlock = () => {
      audios.forEach(audio => {
        audio.play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
          })
          .catch(() => { });
      });
      // Remove listeners once successfully unlocked
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('touchstart', unlock);
      console.log('[SFX] All audio contexts successfully unlocked by user interaction.');
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('touchstart', unlock);
  }
  unlockAudioContexts();

  function playSFX(audio) {
    const enabled = localStorage.getItem('rgpv_fetch_sfx_enabled') !== 'false';
    const vol = parseFloat(localStorage.getItem('rgpv_fetch_sfx_volume') ?? '70') / 100;
    console.log(`[SFX] playSFX called: src=${audio.src}, enabled=${enabled}, volume=${vol}`);
    if (!enabled) return;
    audio.volume = vol;
    audio.currentTime = 0;
    audio.play()
      .then(() => console.log(`[SFX] Playback started successfully.`))
      .catch((err) => console.error(`[SFX] Playback failed:`, err));
  }
  let particleNetwork = null;

  const gradePoints = {
    'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C+': 6, 'C': 5, 'D': 4, 'F': 0, 'ABS': 0, 'W': 0
  };

  initApp();

  // Initializes dashboard sub-components and loads configuration state
  async function initApp() {
    setupAccordion();
    setupTabs();
    setupExportActions();
    setupSubjectSelect();
    setupInputModeToggle();
    setupRangePreview();
    setupLateralToggle();
    setupThemeToggle();
    setupClearCache();
    setupModal();
    setupCustomizer();
    loadSetupState();
    await loadCourses();
    await loadColleges();
    setupEventSource();
    particleNetwork = new BackgroundMatrix('particleCanvas');
    particleNetwork.start();
  }

  // Setup change event listener for subject select dropdown
  function setupSubjectSelect() {
    subjectSelect.addEventListener('change', () => {
      currentSelectedSubject = subjectSelect.value;
      drawSubjectChart();
    });
  }

  // Set up report card and disclaimer modal click event handlers
  function setupModal() {
    closeModalBtn.addEventListener('click', () => reportCardModal.classList.add('hidden'));
    reportCardModal.addEventListener('click', (e) => {
      if (e.target === reportCardModal) {
        reportCardModal.classList.add('hidden');
      }
    });

    if (disclaimerLink) {
      disclaimerLink.addEventListener('click', (e) => {
        e.preventDefault();
        disclaimerModal.classList.remove('hidden');
      });
    }
    if (closeDisclaimerBtn) {
      closeDisclaimerBtn.addEventListener('click', () => disclaimerModal.classList.add('hidden'));
    }
    if (disclaimerModal) {
      disclaimerModal.addEventListener('click', (e) => {
        if (e.target === disclaimerModal) {
          disclaimerModal.classList.add('hidden');
        }
      });
    }
  }

  // Builds and opens the modal report card layout for a selected student record
  function openReportCardModal(student) {
    if (!student) return;

    const clgCode = student.enrollId.substring(0, 4);
    let collegeName = 'N/A';
    if (globalCollegesData[clgCode]) {
      collegeName = globalCollegesData[clgCode].name || globalCollegesData[clgCode];
    } else {
      const selectedText = collegeSelect.options[collegeSelect.selectedIndex]?.text || '';
      if (selectedText && selectedText !== 'Select College') {
        collegeName = selectedText.replace(/^\[\d+\]\s*/, '');
      } else {
        collegeName = `College [${clgCode}]`;
      }
    }

    const courseId = student.courseId || activeJobCourseId || courseSelect.value || '24';
    const rawCourseName = coursesData[courseId]?.name || (courseSelect.options[courseSelect.selectedIndex]?.text || 'N/A');
    const courseName = rawCourseName.replace(/\s*\(\d+\)\s*/g, '');
    const branchCode = student.enrollId.substring(4, 6).toUpperCase();

    const semester = student.semester || activeJobSemester || semesterInput.value || 'N/A';

    let subjectsHtml = '';
    if (student.format === 'grading') {
      subjectsHtml = `
        <div class="marksheet-table-container">
          <table class="marksheet-table">
            <thead>
              <tr>
                <th>Subject Code</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              ${student.subjects.map(sub => `
                <tr>
                  <td><strong>${sub.subject || sub.subjectCode}</strong></td>
                  <td><strong class="text-cyan">${sub.grade}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      subjectsHtml = `
        <div class="marksheet-table-container">
          <table class="marksheet-table">
            <thead>
              <tr>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th>Theory Marks</th>
                <th>Practical Marks</th>
                <th>Total Marks</th>
              </tr>
            </thead>
            <tbody>
              ${student.subjects.map(sub => `
                <tr>
                  <td><strong>${sub.subjectCode}</strong></td>
                  <td>${sub.subjectName}</td>
                  <td>${sub.theoryMarks}</td>
                  <td>${sub.practicalMarks}</td>
                  <td><strong>${sub.total}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    const statusText = (student.status || 'PASS').toUpperCase();
    let badgeClass = 'pass';
    if (statusText.includes('FAIL')) {
      badgeClass = 'fail';
    } else if (statusText.includes('GRACE')) {
      badgeClass = 'grace';
    }

    const summaryHtml = `
      <div class="marksheet-summary">
        ${student.sgpa ? `
          <div class="marksheet-summary-card">
            <span class="lbl">SGPA</span>
            <span class="val" style="color: var(--accent-secondary);">${student.sgpa}</span>
          </div>
        ` : ''}
        ${student.cgpa ? `
          <div class="marksheet-summary-card">
            <span class="lbl">CGPA</span>
            <span class="val" style="color: var(--accent-secondary);">${student.cgpa}</span>
          </div>
        ` : ''}
        ${student.totalMarks ? `
          <div class="marksheet-summary-card">
            <span class="lbl">Total Marks</span>
            <span class="val">${student.totalMarks}</span>
          </div>
        ` : ''}
        <div class="marksheet-summary-card">
          <span class="lbl">Result Status</span>
          <span class="badge ${badgeClass}" style="font-size: 0.82rem; padding: 0.35rem 0.8rem; margin-top: 0.1rem;">${student.status || 'PASS'}</span>
        </div>
      </div>
    `;

    modalReportContent.innerHTML = `
      <div class="marksheet-header-info">
        <div class="info-item"><span class="lbl">Student Name</span><span class="val">${student.name}</span></div>
        <div class="info-item"><span class="lbl">Enrollment No.</span><span class="val">${student.enrollId}</span></div>
        <div class="info-item"><span class="lbl">Course & Branch</span><span class="val">${courseName} (${branchCode})</span></div>
        <div class="info-item"><span class="lbl">Institution</span><span class="val">${collegeName}</span></div>
        <div class="info-item"><span class="lbl">Semester</span><span class="val">${semester}</span></div>
        <div class="info-item"><span class="lbl">Result Format</span><span class="val">${student.format === 'grading' ? 'Grading System (CBGS/CBCS)' : 'Non-Grading Marks System'}</span></div>
      </div>
      ${subjectsHtml}
      ${summaryHtml}
    `;

    reportCardModal.classList.remove('hidden');
  }

  // Setup visual vs manual form inputs toggle buttons
  function setupInputModeToggle() {
    inputModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        inputModeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeInputMode = btn.getAttribute('data-mode');

        if (activeInputMode === 'visual') {
          helperInputContainer.classList.remove('hidden');
          manualInputContainer.classList.add('hidden');
        } else {
          helperInputContainer.classList.add('hidden');
          manualInputContainer.classList.remove('hidden');
        }
      });
    });
  }

  // Set up theme toggler buttons and loads local storage preference
  function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeToggleLabel = document.getElementById('themeToggleLabel');

    const updateLabel = (isDark) => {
      if (themeToggleLabel) {
        themeToggleLabel.textContent = isDark ? 'Deep Space Dark' : 'Light Blueprint';
      }
    };

    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-theme');
      themeIcon.textContent = '☀️';
      updateLabel(true);
    } else {
      document.body.classList.remove('dark-theme');
      themeIcon.textContent = '🌙';
      updateLabel(false);
    }

    themeToggle.addEventListener('click', () => {
      const isDark = !document.body.classList.contains('dark-theme');
      const transitionType = document.getElementById('themeTransitionSelect')?.value || 'ripple';

      if (transitionType === 'ripple') {
        triggerRadialThemeTransition(isDark);
      } else {
        triggerStaggerStagingTheme(isDark);
      }
    });

    // Helper for staggered circular/radial theme snap transition
    function triggerStaggerStagingTheme(isDark) {
      const centerLimitX = window.innerWidth / 2;
      const centerLimitY = window.innerHeight / 2;

      // Select all major container components and elements
      const elements = document.querySelectorAll('body, header, main, .card, .glass, button, input, select, th, td, h1, h2, h3, h4, p, span, label, .settings-drawer');

      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const elX = rect.left + rect.width / 2;
        const elY = rect.top + rect.height / 2;
        const dx = elX - centerLimitX;
        const dy = elY - centerLimitY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Calculate delay proportional to distance from center (0.4ms per pixel)
        const delay = Math.round(dist * 0.4);

        el.style.transition = 'background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.transitionDelay = `${delay}ms`;
      });

      // Force layout calculation
      document.body.offsetHeight;

      document.body.classList.toggle('dark-theme', isDark);
      themeIcon.textContent = isDark ? '☀️' : '🌙';
      updateLabel(isDark);
      localStorage.setItem('theme', isDark ? 'dark' : 'light');

      // Clean up transitions after completion
      setTimeout(() => {
        elements.forEach(el => {
          el.style.transition = '';
          el.style.transitionDelay = '';
        });
      }, 1300);
    }
  }

  // Setup click event handler for clear cache REST postback
  function setupClearCache() {
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (!clearCacheBtn) return;

    clearCacheBtn.addEventListener('click', async (e) => {
      const isScraping = statusLabel.textContent === 'Scraping';
      if (isScraping) {
        alert('Cannot clear cache while a scraping job is active.');
        return;
      }

      if (!confirm('Are you sure you want to clear all locally cached student results? Subsequent fetches will pull fresh data from the university portal.')) {
        return;
      }

      try {
        clearCacheBtn.disabled = true;
        clearCacheBtn.style.opacity = '0.5';

        const res = await fetch('/api/scrape/clear-cache', { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
          alert(data.message);
          // Trigger dustbin fountain animation after alert OK is clicked
          spawnTrashFountain(clearCacheBtn);
        } else {
          alert('Error: ' + (data.error || 'Failed to clear cache'));
        }
      } catch (err) {
        alert('Request failed: ' + err.message);
      } finally {
        clearCacheBtn.disabled = false;
        clearCacheBtn.style.opacity = '';
      }
    });
  }

  // Setup click handler for advanced controls accordion toggle
  function setupAccordion() {
    advTrigger.addEventListener('click', () => {
      advTrigger.classList.toggle('active');
      advContent.classList.toggle('open');
    });
  }

  // Setup layout tab navigation headers
  function setupTabs() {
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');

        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
        currentActiveTab = tabId;
      });
    });
  }

  // Setup export format quick action buttons
  function setupExportActions() {
    exportQuickBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.getAttribute('data-format');
        const courseId = courseSelect.value || '24';
        const semester = semesterInput.value || '3';
        const activeBranch = document.getElementById('branchFilter')?.value || 'ALL';
        window.open(`/api/scrape/export?format=${format}&courseId=${courseId}&sem=${semester}&branch=${activeBranch}`, '_blank');
      });
    });
  }

  // Spawns a fountain of falling dustbin emojis from a click event source button
  function spawnTrashFountain(button) {
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const count = 15;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'trash-particle';
      particle.textContent = '🗑️';

      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;

      particle.style.left = `${originX}px`;
      particle.style.top = `${originY}px`;
      document.body.appendChild(particle);

      let x = originX;
      let y = originY;
      let vx = (Math.random() - 0.5) * 6; // Horizontal velocity
      let vy = -Math.random() * 8 - 4;     // Upward initial velocity
      const gravity = 0.4;                // Gravity
      let angle = Math.random() * 360;
      const spin = (Math.random() - 0.5) * 16;
      let opacity = 1.0;

      const anim = () => {
        vy += gravity;
        x += vx;
        y += vy;
        angle += spin;
        opacity -= 0.022;

        if (opacity <= 0) {
          particle.remove();
        } else {
          particle.style.transform = `translate(${x - originX}px, ${y - originY}px) rotate(${angle}deg) scale(${opacity})`;
          particle.style.opacity = opacity;
          requestAnimationFrame(anim);
        }
      };
      requestAnimationFrame(anim);
    }
  }

  // Setup styling customizer event listeners
  function setupCustomizer() {
    const settingsToggleBtn = document.getElementById('settingsToggleBtn');
    const settingsDrawer = document.getElementById('settingsDrawer');
    const fullResetBtn = document.getElementById('fullResetBtn');

    if (settingsToggleBtn && settingsDrawer) {
      settingsToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsDrawer.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!settingsDrawer.contains(e.target) && e.target !== settingsToggleBtn) {
          settingsDrawer.classList.add('hidden');
        }
      });
    }

    if (fontSelect) {
      fontSelect.addEventListener('change', () => {
        document.documentElement.style.setProperty('--font-main', `'${fontSelect.value}', sans-serif`);
        localStorage.setItem('rgpv_fetch_custom_font', fontSelect.value);
      });
      const savedFont = localStorage.getItem('rgpv_fetch_custom_font');
      if (savedFont) {
        fontSelect.value = savedFont;
        document.documentElement.style.setProperty('--font-main', `'${savedFont}', sans-serif`);
      }
    }

    if (fontSizeSlider && fontSizeDisplay) {
      const applySize = (size) => {
        document.documentElement.style.fontSize = size + 'px';
        fontSizeDisplay.textContent = size + 'px';
        localStorage.setItem('rgpv_fetch_custom_font_size', size);
      };

      fontSizeSlider.addEventListener('input', (e) => {
        fontSizeDisplay.textContent = e.target.value + 'px';
      });

      fontSizeSlider.addEventListener('change', (e) => {
        applySize(e.target.value);
      });

      const savedSize = localStorage.getItem('rgpv_fetch_custom_font_size');
      if (savedSize) {
        fontSizeSlider.value = savedSize;
        applySize(savedSize);
      }
    }

    if (animationSelect) {
      animationSelect.addEventListener('change', () => {
        if (particleNetwork && matrixBgToggle && matrixBgToggle.checked) {
          particleNetwork.setMode(animationSelect.value);
        }
        localStorage.setItem('rgpv_fetch_custom_anim', animationSelect.value);
      });
      const savedAnim = localStorage.getItem('rgpv_fetch_custom_anim');
      if (savedAnim) {
        animationSelect.value = savedAnim;
      }
    }

    if (fullResetBtn) {
      fullResetBtn.addEventListener('click', async () => {
        playSFX(sfxConfirm);

        if (!confirm('A complete system wipe is requested. Are you sure you want to reset styles and miner states?')) {
          sfxConfirm.pause();
          return;
        }

        if (!confirm('WARNING: This will permanently wipe your style dashboard settings and cache records. Are you absolutely sure?')) {
          sfxConfirm.pause();
          return;
        }

        localStorage.removeItem('rgpv_fetch_custom_font');
        localStorage.removeItem('rgpv_fetch_custom_font_size');
        localStorage.removeItem('rgpv_fetch_custom_anim');
        localStorage.removeItem('theme');

        if (fontSelect) {
          fontSelect.value = 'Outfit';
        }
        document.documentElement.style.setProperty('--font-main', "'Outfit', sans-serif");

        if (fontSizeSlider) {
          fontSizeSlider.value = '16';
        }
        if (fontSizeDisplay) {
          fontSizeDisplay.textContent = '16px';
        }
        document.documentElement.style.fontSize = '';

        if (animationSelect) {
          animationSelect.value = 'particles';
        }
        if (particleNetwork) {
          particleNetwork.setMode('particles');
          particleNetwork.startCalm();
        }

        document.body.classList.remove('dark-theme');
        const themeIcon = document.getElementById('themeToggle')?.querySelector('.theme-icon');
        if (themeIcon) {
          themeIcon.textContent = '🌙';
        }
        const themeToggleLabel = document.getElementById('themeToggleLabel');
        if (themeToggleLabel) {
          themeToggleLabel.textContent = 'Light Blueprint';
        }

        try {
          const resetRes = await fetch('/api/scrape/reset', { method: 'POST' });
          if (resetRes.ok) {
            studentsResults = [];
            activeBranchesList = [];
            currentSortCol = 'enrollId';
            currentSortDir = 'asc';
            updateTableHeaders();
            const branchFilter = document.getElementById('branchFilter');
            if (branchFilter) {
              branchFilter.value = 'ALL';
            }
            const branchWrapper = document.getElementById('branchFilterWrapper');
            if (branchWrapper) {
              branchWrapper.classList.add('hidden');
            }
            tableBody.innerHTML = `
              <tr class="placeholder-row">
                <td colspan="5" class="txt-muted text-center">Trigger a scraping job to populate data grid</td>
              </tr>
            `;
            resultsCount.textContent = '0 student records found';
            progressCard.classList.add('hidden');
            exportQuickBtns.forEach(btn => btn.disabled = true);

            avgSgpaVal.textContent = '0.00';
            sgpaGaugeFill.style.strokeDashoffset = '251.2';
            avgCgpaVal.textContent = '0.00';
            cgpaGaugeFill.style.strokeDashoffset = '251.2';
            passRateVal.textContent = '0%';
            passGaugeFill.style.strokeDashoffset = '251.2';
            subjectsChartContainer.innerHTML = '<div class="txt-muted text-center py-4">No grading data parsed yet</div>';
            tallyPassedCount.textContent = '0';
            tallyGraceCount.textContent = '0';
            tallyFailedCount.textContent = '0';

            alert('Dashboard styles, settings, and scraper states have been successfully reset.');
          } else {
            alert('Styles reset successfully, but server failed to reset scraping state.');
          }
        } catch (err) {
          alert('Styles reset successfully, but error communicating with server reset: ' + err.message);
        }
      });
    }

    const sfxToggle = document.getElementById('sfxToggle');
    const sfxVolumeSlider = document.getElementById('sfxVolumeSlider');
    const sfxVolumeDisplay = document.getElementById('sfxVolumeDisplay');
    const sfxVolumeContainer = document.getElementById('sfxVolumeContainer');
    const themeTransitionSelect = document.getElementById('themeTransitionSelect');

    if (sfxToggle && sfxVolumeSlider && sfxVolumeDisplay && sfxVolumeContainer) {
      const updateVolumeText = (val) => {
        sfxVolumeDisplay.textContent = val + '%';
        const vol = parseFloat(val) / 100;
        sfxConfirm.volume = vol;
        sfxSuccess.volume = vol;
        sfxCook.volume = vol;
        sfxFahh.volume = vol;
        sfxBye.volume = vol;
      };

      const sfxEnabled = localStorage.getItem('rgpv_fetch_sfx_enabled') !== 'false';
      sfxToggle.checked = sfxEnabled;
      if (sfxEnabled) {
        sfxVolumeContainer.classList.remove('hidden');
      }

      const sfxVolume = localStorage.getItem('rgpv_fetch_sfx_volume') || '70';
      sfxVolumeSlider.value = sfxVolume;
      updateVolumeText(sfxVolume);

      sfxToggle.addEventListener('change', () => {
        const enabled = sfxToggle.checked;
        
        if (enabled) {
          localStorage.setItem('rgpv_fetch_sfx_enabled', 'true');
          playSFX(sfxSuccess);
          
          sfxVolumeContainer.classList.remove('hidden', 'thanos-snap');
          sfxVolumeContainer.classList.add('thanos-assemble');
          setTimeout(() => {
            if (sfxToggle.checked) {
              sfxVolumeContainer.classList.remove('thanos-assemble');
            }
          }, 800);
        } else {
          // Play the bye sound effect immediately before turning off the system state
          const vol = parseFloat(localStorage.getItem('rgpv_fetch_sfx_volume') ?? '70') / 100;
          sfxBye.volume = vol;
          sfxBye.currentTime = 0;
          sfxBye.play().catch(() => {});
          
          localStorage.setItem('rgpv_fetch_sfx_enabled', 'false');
          
          sfxVolumeContainer.classList.remove('thanos-assemble');
          sfxVolumeContainer.classList.add('thanos-snap');
          setTimeout(() => {
            if (!sfxToggle.checked) {
              sfxVolumeContainer.classList.add('hidden');
            }
          }, 800);
        }
      });

      sfxVolumeSlider.addEventListener('input', (e) => {
        updateVolumeText(e.target.value);
      });

      sfxVolumeSlider.addEventListener('change', (e) => {
        localStorage.setItem('rgpv_fetch_sfx_volume', e.target.value);
      });
    }

    if (themeTransitionSelect) {
      themeTransitionSelect.addEventListener('change', () => {
        localStorage.setItem('rgpv_fetch_theme_transition', themeTransitionSelect.value);
      });
      const savedTransition = localStorage.getItem('rgpv_fetch_theme_transition');
      if (savedTransition) {
        themeTransitionSelect.value = savedTransition;
      }
    }

    // Matrix Background Toggle & Custom Sizes
    if (matrixBgToggle && matrixSettingsContainer && matrixIdleSizeSlider && matrixIdleSizeDisplay && matrixActiveSizeSlider && matrixActiveSizeDisplay && animationSelect) {

      const updateIdleSizeText = (val) => {
        matrixIdleSizeDisplay.textContent = val + '%';
        if (particleNetwork) {
          particleNetwork.idleSize = parseFloat(val);
        }
      };

      const updateActiveSizeText = (val) => {
        matrixActiveSizeDisplay.textContent = val + '%';
        if (particleNetwork) {
          particleNetwork.activeSize = parseFloat(val);
        }
      };

      // Load initial values
      const matrixBgEnabled = localStorage.getItem('rgpv_matrix_bg_enabled') !== 'false';
      matrixBgToggle.checked = matrixBgEnabled;
      if (matrixBgEnabled) {
        matrixSettingsContainer.classList.remove('hidden');
      } else {
        matrixSettingsContainer.classList.add('hidden');
        if (particleNetwork) {
          particleNetwork.setMode('none');
        }
      }

      const savedIdleSize = localStorage.getItem('rgpv_matrix_idle_size') || '200';
      matrixIdleSizeSlider.value = savedIdleSize;
      updateIdleSizeText(savedIdleSize);

      const savedActiveSize = localStorage.getItem('rgpv_matrix_active_size') || '300';
      matrixActiveSizeSlider.value = savedActiveSize;
      updateActiveSizeText(savedActiveSize);

      // Listeners for toggle
      matrixBgToggle.addEventListener('change', () => {
        const enabled = matrixBgToggle.checked;
        localStorage.setItem('rgpv_matrix_bg_enabled', enabled);

        if (enabled) {
          matrixSettingsContainer.classList.remove('hidden', 'thanos-snap');
          matrixSettingsContainer.classList.add('thanos-assemble');

          if (particleNetwork) {
            particleNetwork.setMode(animationSelect.value);
          }

          setTimeout(() => {
            if (matrixBgToggle.checked) {
              matrixSettingsContainer.classList.remove('thanos-assemble');
            }
          }, 800);
        } else {
          matrixSettingsContainer.classList.remove('thanos-assemble');
          matrixSettingsContainer.classList.add('thanos-snap');

          if (particleNetwork) {
            particleNetwork.setMode('none');
          }

          setTimeout(() => {
            if (!matrixBgToggle.checked) {
              matrixSettingsContainer.classList.add('hidden');
            }
          }, 800);
        }
      });

      // Listeners for sliders
      matrixIdleSizeSlider.addEventListener('input', (e) => {
        updateIdleSizeText(e.target.value);
      });
      matrixIdleSizeSlider.addEventListener('change', (e) => {
        localStorage.setItem('rgpv_matrix_idle_size', e.target.value);
      });

      matrixActiveSizeSlider.addEventListener('input', (e) => {
        updateActiveSizeText(e.target.value);
      });
      matrixActiveSizeSlider.addEventListener('change', (e) => {
        localStorage.setItem('rgpv_matrix_active_size', e.target.value);
      });
    }

    // Scanning HUD Overlay Toggle
    if (scannerUiToggle) {
      const scannerEnabled = localStorage.getItem('rgpv_scanner_ui_enabled') !== 'false';
      scannerUiToggle.checked = scannerEnabled;

      scannerUiToggle.addEventListener('change', () => {
        localStorage.setItem('rgpv_scanner_ui_enabled', scannerUiToggle.checked);
      });
    }
  }

  // Fetches available RGPV course categories from server
  async function loadCourses() {
    try {
      const res = await fetch('/api/courses');
      coursesData = await res.json();

      courseSelect.innerHTML = '';
      Object.entries(coursesData).forEach(([id, info]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${info.name} (${id})`;
        if (id === '24') option.selected = true;
        courseSelect.appendChild(option);
      });

      if (pendingSavedCourse) {
        courseSelect.value = pendingSavedCourse;
        pendingSavedCourse = '';
      }
    } catch (err) {
      console.error('Failed to load course configurations:', err);
    }
  }

  // Fetches registered colleges details from server
  async function loadColleges() {
    try {
      const res = await fetch('/api/colleges');
      globalCollegesData = await res.json();

      collegeSelect.innerHTML = '';

      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.disabled = true;
      defaultOpt.textContent = 'Select College';
      collegeSelect.appendChild(defaultOpt);

      const sortedColleges = Object.entries(globalCollegesData).sort((a, b) => a[0].localeCompare(b[0]));

      sortedColleges.forEach(([code, c]) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = `[${code}] ${c.name}${c.city ? ` (${c.city})` : ''}`;
        if (code === '0176') option.selected = true;
        collegeSelect.appendChild(option);
      });

      if (pendingSavedCollege) {
        collegeSelect.value = pendingSavedCollege;
        pendingSavedCollege = '';
      }

      updateRangePreview();
    } catch (err) {
      console.error('Failed to load colleges:', err);
    }
  }

  // Establishes real-time SSE stream listeners to handle scraping progress events
  function setupEventSource() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('/api/scrape/stream');

    eventSource.addEventListener('state', (e) => {
      const data = JSON.parse(e.data);
      const currentStatus = data.status;
      const resultsCount = data.resultsCount ?? (data.results ? data.results.length : 0);

      console.log(`[SSE State] currentStatus=${currentStatus}, previousJobStatus=${previousJobStatus}, resultsCount=${resultsCount}`);

      if (currentStatus === 'scraping') {
        if (previousJobStatus !== 'scraping') {
          playSFX(sfxCook);
        }
        sfxPlayedForThisJob = false;
      }

      if (currentStatus === 'completed' && (resultsCount > 0 || studentsResults.length > 0) && !sfxPlayedForThisJob) {
        console.log(`[SSE State] Job completed with results. Triggering success sequence...`);
        sfxPlayedForThisJob = true;
        playSFX(sfxSuccess);

        setTimeout(() => {
          const tabsCard = document.querySelector('.tabs-card');
          if (tabsCard) {
            console.log(`[SSE State] Scrolling window down to results...`);
            const offsetTop = tabsCard.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: offsetTop - 20, behavior: 'smooth' });
          }
        }, 1400);
      }

      previousJobStatus = currentStatus;
      updateStatusDisplay(currentStatus);

      if (data.semester) activeJobSemester = String(data.semester);
      if (data.courseId) activeJobCourseId = String(data.courseId);
      if (data.progress) {
        if (data.progress.courseId) activeJobCourseId = String(data.progress.courseId);
        if (data.progress.semester) activeJobSemester = String(data.progress.semester);
      }

      if (data.status === 'scraping') {
        lockUI();
        progressCard.classList.remove('hidden');
        if (progressBarText) progressBarText.textContent = '';
      } else if (data.status === 'completed' || data.status === 'aborted' || data.status === 'failed') {
        unlockUI();

        // Pause and reset "Let him cook now" SFX on completion, abort, or error
        sfxCook.pause();
        sfxCook.currentTime = 0;

        if (resultsCount > 0) {
          progressCard.classList.remove('hidden');
          exportQuickBtns.forEach(btn => btn.disabled = false);
        }

        if (progressBarText) {
          const studentCount = data.results ? data.results.length : 0;
          const durationText = (data.duration !== undefined && data.duration !== null) ? ` in ${formatDuration(data.duration)}` : '';
          if (data.status === 'completed') {
            progressBarText.textContent = `Completed: Fetched ${studentCount} students${durationText}`;
            progressBarFill.style.width = '100%';
            progressBarFill.classList.remove('indeterminate');
          } else if (data.status === 'aborted') {
            progressBarText.textContent = `Aborted: Fetched ${studentCount} students${durationText}`;
          } else if (data.status === 'failed') {
            progressBarText.textContent = `Failed${durationText}`;
          }
        }
      }

      if (data.results && data.results.length > 0) {
        studentsResults = data.results;
        updateBranchFilterDropdown();
        rebuildTable();
        calculateAnalytics();
      }

      updateProgressDisplay(data.progress);
    });

    eventSource.addEventListener('progress', (e) => {
      const progress = JSON.parse(e.data);
      if (progress.courseId) activeJobCourseId = String(progress.courseId);
      if (progress.semester) activeJobSemester = String(progress.semester);
      updateProgressDisplay(progress);
    });

    eventSource.addEventListener('student', (e) => {
      const student = JSON.parse(e.data);
      studentsResults.push(student);
      updateBranchFilterDropdown();
      rebuildTable(true);
      calculateAnalytics();
    });

    eventSource.onerror = () => {
      console.warn('SSE Stream disconnected. Attempting reconnect...');
    };
  }

  // Setup click handler to trigger the scraping form submit postback
  scrapeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    let finalRollInput = '';

    if (activeInputMode === 'visual') {
      const clg = collegeSelect.value;
      const branchRaw = branchInput.value.trim();
      const year = String(yearInput.value).trim();
      const startNumRaw = String(rangeStartInput.value).trim();
      const endNumRaw = String(rangeEndInput.value).trim();

      if (!clg || !branchRaw || !year || !startNumRaw) {
        alert('Please fill out all visual helper fields (College, Year, Branch, and Start).');
        return;
      }

      const branches = branchRaw.split(',').map(b => b.trim().toUpperCase()).filter(Boolean);
      if (branches.length === 0) {
        alert('Please enter at least one branch code.');
        return;
      }

      const startNum = startNumRaw.padStart(3, '0');
      const endNum = endNumRaw ? endNumRaw.padStart(3, '0') : '';

      const ranges = branches.map(branch => `${clg}${branch}${year}1${startNum}-${endNum}`);
      finalRollInput = ranges.join(', ');
    } else {
      finalRollInput = rollInput.value.trim();
      if (!finalRollInput) {
        alert('Please enter a manual enrollment range or list (e.g. 0103AL241001-010).');
        return;
      }
    }

    if (includeLateralCheckbox.checked && parseInt(semesterInput.value, 10) >= 3) {
      const latRange = lateralRangeInput.value.trim();
      if (!latRange.match(/^\d{2}-\d{2}$/)) {
        alert('Please enter a valid 2-digit lateral range (e.g. 01-15).');
        return;
      }
    }

    const payload = {
      courseId: courseSelect.value,
      semester: parseInt(semesterInput.value, 10),
      rollInput: finalRollInput,
      concurrency: parseInt(concurrencyInput.value, 10),
      staggerDelay: parseInt(staggerDelayInput.value, 10),
      delay: parseInt(delayInput.value, 10),
      retries: parseInt(retriesInput.value, 10),
      useCache: cacheCheckbox.checked,
      includeLateral: includeLateralCheckbox.checked && parseInt(semesterInput.value, 10) >= 3,
      lateralRange: lateralRangeInput.value.trim()
    };

    activeJobCourseId = courseSelect.value;
    activeJobSemester = semesterInput.value;

    try {
      const res = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Server error starting scraper');
      }

      studentsResults = [];
      activeBranchesList = [];
      document.getElementById('branchFilter').value = 'ALL';
      document.getElementById('branchFilterWrapper').classList.add('hidden');
      tableBody.innerHTML = '';
      resultsCount.textContent = '0 student records found';

      progressCard.classList.remove('hidden');
      lockUI();
    } catch (err) {
      alert(`Failed to start scraping: ${err.message}`);
    }
  });

  // Setup click handler to trigger scraping abort call
  stopBtn.addEventListener('click', async () => {
    try {
      if (studentsResults.length === 0) {
        playSFX(sfxFahh);
      }
      const res = await fetch('/api/scrape/stop', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Server error stopping scraper');
      }
    } catch (err) {
      alert(`Failed to abort scraper: ${err.message}`);
    }
  });

  // Setup click handler to trigger scraper memory reset
  resetBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/scrape/reset', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Server error resetting scraper state');
      }

      studentsResults = [];
      activeBranchesList = [];
      currentSortCol = 'enrollId';
      currentSortDir = 'asc';
      updateTableHeaders();
      document.getElementById('branchFilter').value = 'ALL';
      document.getElementById('branchFilterWrapper').classList.add('hidden');
      tableBody.innerHTML = `
        <tr class="placeholder-row">
          <td colspan="5" class="txt-muted text-center">Trigger a scraping job to populate data grid</td>
        </tr>
      `;
      resultsCount.textContent = '0 student records found';

      progressCard.classList.add('hidden');
      exportQuickBtns.forEach(btn => btn.disabled = true);

      avgSgpaVal.textContent = '0.00';
      sgpaGaugeFill.style.strokeDashoffset = '251.2';
      avgCgpaVal.textContent = '0.00';
      cgpaGaugeFill.style.strokeDashoffset = '251.2';
      passRateVal.textContent = '0%';
      passGaugeFill.style.strokeDashoffset = '251.2';
      subjectsChartContainer.innerHTML = '<div class="txt-muted text-center py-4">No grading data parsed yet</div>';
      tallyPassedCount.textContent = '0';
      tallyGraceCount.textContent = '0';
      tallyFailedCount.textContent = '0';
    } catch (err) {
      alert(`Failed to reset state: ${err.message}`);
    }
  });

  // Setup click event handler for table header sorting triggers
  tableHeadersRow.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;

    const col = th.getAttribute('data-sort');
    if (!col) return;

    if (currentSortCol === col) {
      currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      currentSortCol = col;
      currentSortDir = (col === 'sgpa' || col === 'cgpa') ? 'desc' : 'asc';
    }

    updateTableHeaders();
    rebuildTable();
  });

  // Updates column visual arrow icons indicating table sorting state
  function updateTableHeaders() {
    const headers = {
      enrollId: 'Enrollment',
      name: 'Student Name',
      sgpa: 'SGPA',
      cgpa: 'CGPA',
      status: 'Status'
    };

    const ths = tableHeadersRow.querySelectorAll('th');
    ths.forEach(th => {
      const col = th.getAttribute('data-sort');
      if (col) {
        let label = headers[col];
        if (col === currentSortCol) {
          label += currentSortDir === 'asc' ? ' ▲' : ' ▼';
          th.classList.add('sorted-active');
        } else {
          th.classList.remove('sorted-active');
        }
        th.textContent = label;
      }
    });
  }

  // Disables form controls during active scraping job operations
  function lockUI() {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    resetBtn.disabled = true;
    exportQuickBtns.forEach(btn => btn.disabled = true);
    courseSelect.disabled = true;
    semesterInput.disabled = true;
    concurrencyInput.disabled = true;
    staggerDelayInput.disabled = true;
    collegeSelect.disabled = true;
    yearInput.disabled = true;
    branchInput.disabled = true;
    rangeStartInput.disabled = true;
    rangeEndInput.disabled = true;
    delayInput.disabled = true;
    retriesInput.disabled = true;
    cacheCheckbox.disabled = true;
    rememberSetupCheckbox.disabled = true;
    includeLateralCheckbox.disabled = true;
    lateralRangeInput.disabled = true;
  }

  // Re-enables form controls once scraping operations complete or stop
  function unlockUI() {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    resetBtn.disabled = false;
    courseSelect.disabled = false;
    semesterInput.disabled = false;
    concurrencyInput.disabled = false;
    staggerDelayInput.disabled = false;
    collegeSelect.disabled = false;
    yearInput.disabled = false;
    branchInput.disabled = false;
    rangeStartInput.disabled = false;
    rangeEndInput.disabled = false;
    delayInput.disabled = false;
    retriesInput.disabled = false;
    cacheCheckbox.disabled = false;
    rememberSetupCheckbox.disabled = false;
    includeLateralCheckbox.disabled = false;
    lateralRangeInput.disabled = false;
  }

  // Updates status indicator visual light matching current system state
  function updateStatusDisplay(status) {
    statusIndicator.className = 'status-indicator';
    if (status !== 'idle') {
      statusIndicator.classList.add(status);
    }

    statusLabel.textContent = status.charAt(0).toUpperCase() + status.slice(1);

    const container = document.querySelector('main.container');
    const scanner = document.getElementById('cyberScanner');

    if (status === 'scraping') {
      lockUI();
      if (container) {
        container.classList.add('mining-active');
      }
      const scannerEnabled = localStorage.getItem('rgpv_scanner_ui_enabled') !== 'false';
      if (scanner && scannerEnabled) {
        scanner.classList.remove('hidden');
      }
      if (particleNetwork) {
        particleNetwork.startMining();
      }
    } else {
      unlockUI();
      if (container) {
        container.classList.remove('mining-active');
      }
      if (scanner) {
        scanner.classList.add('hidden');
      }

      if (status === 'completed' || status === 'aborted') {
        if (particleNetwork) {
          particleNetwork.triggerBlast();
        }
      } else {
        if (particleNetwork) {
          particleNetwork.startCalm();
        }
      }

      if (studentsResults.length > 0) {
        exportQuickBtns.forEach(btn => btn.disabled = false);
      }
    }
  }

  // Updates completion percentage bar and label counts safely using correction offset logic
  function updateProgressDisplay(progress) {
    if (!progress || progress.total === 0) return;

    if (progressBarText && (progress.status === 'scraping' || progress.status === 'starting')) {
      progressBarText.textContent = '';
    }

    const isScraping = progress.status === 'scraping' || progress.status === 'starting';
    const current = isScraping ? Math.max(0, progress.current - 1) : progress.current;

    if (progress.isOpenEnded) {
      if (isScraping) {
        progressCounts.textContent = `${current} Students fetched (Scanning...)`;
        progressPercent.style.display = 'none';
        progressBarFill.classList.add('indeterminate');
        progressBarFill.style.width = '100%';
      } else {
        progressCounts.textContent = `${current} Students fetched`;
        progressPercent.style.display = 'none';
        progressBarFill.classList.remove('indeterminate');
        progressBarFill.style.width = '100%';
      }
    } else {
      let pct = Math.round((current / progress.total) * 100);
      pct = Math.max(0, Math.min(100, pct));
      progressCounts.textContent = `${current} / ${progress.total} Students`;
      progressPercent.style.display = '';
      progressPercent.textContent = `${pct}%`;
      progressBarFill.classList.remove('indeterminate');
      progressBarFill.style.width = `${pct}%`;

      console.log(`[Progress Update] pct=${pct}%, status=${progress.status}, sfxPlayedForThisJob=${sfxPlayedForThisJob}`);

      if (pct === 100 && progress.status === 'completed' && studentsResults.length > 0 && !sfxPlayedForThisJob) {
        console.log(`[Progress Update] 100% reached with results. Triggering success sequence...`);
        sfxPlayedForThisJob = true;
        playSFX(sfxSuccess);

        setTimeout(() => {
          const tabsCard = document.querySelector('.tabs-card');
          if (tabsCard) {
            console.log(`[Progress Update] Scrolling window down to results...`);
            const offsetTop = tabsCard.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: offsetTop - 20, behavior: 'smooth' });
          }
        }, 1400);
      }
    }
  }

  // Builds a table row element structure from student details object
  function createStudentRow(student) {
    if (!student) return null;
    const row = document.createElement('tr');

    if (student.error) {
      row.className = 'failed-scrape-row';
      row.innerHTML = `
        <td><span class="txt-muted">${student.enrollId}</span></td>
        <td colspan="3"><span class="text-red">Error: ${student.error}</span></td>
        <td><span class="badge error">ERROR</span></td>
      `;
    } else {
      const statusText = (student.status || 'PASS').toUpperCase();
      let badgeClass = 'pass';
      if (statusText.includes('FAIL')) {
        badgeClass = 'fail';
      } else if (statusText.includes('GRACE')) {
        badgeClass = 'grace';
      }

      row.innerHTML = `
        <td><strong>${student.enrollId}</strong></td>
        <td>${student.name}</td>
        <td><strong class="text-cyan">${student.sgpa || 'N/A'}</strong></td>
        <td>${student.cgpa || 'N/A'}</td>
        <td><span class="badge ${badgeClass}">${student.status || 'PASS'}</span></td>
      `;

      row.addEventListener('click', () => {
        openReportCardModal(student);
      });
    }
    return row;
  }

  // Rebuilds the live results table matching sorted memory state
  function rebuildTable(autoScroll = false) {
    tableBody.innerHTML = '';
    const filtered = getFilteredResults();
    const validResults = filtered.filter(r => r);

    if (validResults.length === 0) {
      tableBody.innerHTML = `
        <tr class="placeholder-row">
          <td colspan="5" class="txt-muted text-center">Trigger a scraping job to populate data grid</td>
        </tr>
      `;
      updateStatsCountsOnly();
      return;
    }

    const fragment = document.createDocumentFragment();
    validResults.forEach(student => {
      const row = createStudentRow(student);
      if (row) fragment.appendChild(row);
    });
    tableBody.appendChild(fragment);

    if (autoScroll && currentSortCol === 'enrollId' && currentSortDir === 'asc') {
      const container = tableBody.parentElement.parentElement;
      container.scrollTop = container.scrollHeight;
    }

    updateStatsCountsOnly();
  }

  // Calculates metrics (SGPA/CGPA averages, Pass rates, status counts) from scraped results
  function calculateAnalytics() {
    const filtered = getFilteredResults();
    const successful = filtered.filter(r => r && !r.error);

    let passedCount = 0;
    let graceCount = 0;
    let failedCount = 0;

    filtered.forEach(student => {
      if (!student) return;
      if (student.error) {
        failedCount++;
        return;
      }

      const statusText = String(student.status || 'PASS').toUpperCase();
      if (statusText.includes('FAIL')) {
        failedCount++;
      } else if (statusText.includes('GRACE')) {
        graceCount++;
      } else {
        passedCount++;
      }
    });

    tallyPassedCount.textContent = passedCount;
    tallyGraceCount.textContent = graceCount;
    tallyFailedCount.textContent = failedCount;

    if (successful.length === 0) {
      avgSgpaVal.textContent = '0.00';
      sgpaGaugeFill.style.strokeDashoffset = 251.2;
      avgCgpaVal.textContent = '0.00';
      cgpaGaugeFill.style.strokeDashoffset = 251.2;
      passRateVal.textContent = '0%';
      passGaugeFill.style.strokeDashoffset = 251.2;
      subjectSelect.innerHTML = '<option value="" disabled selected>No Subjects</option>';
      currentSelectedSubject = '';
      subjectsChartContainer.innerHTML = '<div class="txt-muted text-center py-4">No successful records found</div>';
      return;
    }

    let sgpaSum = 0;
    let sgpaCount = 0;
    successful.forEach(res => {
      const gpa = parseFloat(res.sgpa);
      if (!isNaN(gpa) && gpa > 0) {
        sgpaSum += gpa;
        sgpaCount++;
      }
    });

    const avgSgpa = sgpaCount > 0 ? sgpaSum / sgpaCount : 0;
    avgSgpaVal.textContent = avgSgpa.toFixed(2);
    const sgpaOffset = 251.2 - (avgSgpa / 10) * 251.2;
    sgpaGaugeFill.style.strokeDashoffset = sgpaOffset;

    let cgpaSum = 0;
    let cgpaCount = 0;
    successful.forEach(res => {
      const gpa = parseFloat(res.cgpa);
      if (!isNaN(gpa) && gpa > 0) {
        cgpaSum += gpa;
        cgpaCount++;
      }
    });

    const avgCgpa = cgpaCount > 0 ? cgpaSum / cgpaCount : 0;
    avgCgpaVal.textContent = avgCgpa.toFixed(2);
    const cgpaOffset = 251.2 - (avgCgpa / 10) * 251.2;
    cgpaGaugeFill.style.strokeDashoffset = cgpaOffset;

    const passCount = successful.filter(r => r.status && r.status.toUpperCase().includes('PASS')).length;
    const passRate = (passCount / successful.length) * 100;
    passRateVal.textContent = `${Math.round(passRate)}%`;
    const passOffset = 251.2 - (passRate / 100) * 251.2;
    passGaugeFill.style.strokeDashoffset = passOffset;

    const uniqueSubjects = new Set();
    successful.forEach(res => {
      if (res.subjects) {
        res.subjects.forEach(sub => {
          const key = sub.subject || sub.subjectCode;
          if (key) uniqueSubjects.add(key);
        });
      }
    });

    const getSubjectPriority = (code) => {
      if (code.includes('[T]')) return 1;
      if (code.includes('[P]')) return 2;
      return 3;
    };

    const sortedSubjects = Array.from(uniqueSubjects).sort((a, b) => {
      const priorityA = getSubjectPriority(a);
      const priorityB = getSubjectPriority(b);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.localeCompare(b, undefined, { numeric: true });
    });
    const prevSelectVal = subjectSelect.value;
    subjectSelect.innerHTML = '';

    if (sortedSubjects.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.disabled = true;
      opt.selected = true;
      opt.textContent = 'No Subjects';
      subjectSelect.appendChild(opt);
      currentSelectedSubject = '';
    } else {
      sortedSubjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub;
        opt.textContent = sub;
        subjectSelect.appendChild(opt);
      });

      if (sortedSubjects.includes(prevSelectVal)) {
        subjectSelect.value = prevSelectVal;
        currentSelectedSubject = prevSelectVal;
      } else {
        subjectSelect.value = sortedSubjects[0];
        currentSelectedSubject = sortedSubjects[0];
      }
    }

    drawSubjectChart();
  }

  // Renders subject grades distribution tally chart
  function drawSubjectChart() {
    const filtered = getFilteredResults();
    const successful = filtered.filter(r => r && !r.error);
    if (!currentSelectedSubject || successful.length === 0) {
      subjectsChartContainer.innerHTML = '<div class="txt-muted text-center py-4">No grading data parsed yet</div>';
      return;
    }

    const gradeCounts = {
      'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C+': 0, 'C': 0, 'D': 0, 'F': 0,
      'ABS': 0, 'NA': 0
    };

    successful.forEach(res => {
      if (res.subjects) {
        const subInfo = res.subjects.find(s => (s.subject || s.subjectCode) === currentSelectedSubject);
        if (subInfo && subInfo.grade) {
          let grade = subInfo.grade.trim().toUpperCase();

          if (grade.includes('ABS') || grade === 'AB') {
            gradeCounts['ABS']++;
          } else if (grade === 'NA') {
            gradeCounts['NA']++;
          } else {
            // Strip grace hashtags, e.g. C## -> C
            grade = grade.replace(/#/g, '');
            if (gradeCounts[grade] !== undefined) {
              gradeCounts[grade]++;
            } else {
              gradeCounts['F']++;
            }
          }
        }
      }
    });

    const maxCount = Math.max(...Object.values(gradeCounts), 1);
    subjectsChartContainer.innerHTML = '';

    const gradesOrder = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F', 'ABS', 'NA'];
    gradesOrder.forEach(grd => {
      const count = gradeCounts[grd];
      const heightPercent = (count / maxCount) * 100;

      const barWrapper = document.createElement('div');
      barWrapper.className = 'chart-bar-wrapper';
      barWrapper.innerHTML = `
        <div class="chart-bar-fill" style="height: ${heightPercent}%;">
          <span class="chart-bar-value">${count}</span>
        </div>
        <span class="chart-bar-label">${grd}</span>
      `;
      subjectsChartContainer.appendChild(barWrapper);
    });
  }

  // Setup input preview listeners for helper form inputs
  function setupRangePreview() {
    const inputs = [collegeSelect, yearInput, branchInput, rangeStartInput, rangeEndInput];
    inputs.forEach(input => {
      input.addEventListener('input', updateRangePreview);
      input.addEventListener('change', updateRangePreview);
    });
  }

  // Synchronizes visual helper values to render the generated enrollment range preview
  function updateRangePreview() {
    const clg = collegeSelect.value || '____';
    const branchRaw = (branchInput.value || '__').trim();
    const year = String(yearInput.value || '__').trim();
    const type = '1';
    const startNumRaw = String(rangeStartInput.value || '').trim();
    const endNumRaw = String(rangeEndInput.value || '').trim();

    const startNum = startNumRaw ? startNumRaw.padStart(3, '0') : '___';
    const endNum = endNumRaw ? endNumRaw.padStart(3, '0') : '___';

    const branches = branchRaw.split(',').map(b => b.trim().toUpperCase()).filter(Boolean);
    if (branches.length <= 1) {
      const br = branches[0] || '__';
      rangePreviewBadge.textContent = `${clg}${br}${year}${type}${startNum}-${endNum}`;
    } else {
      rangePreviewBadge.textContent = branches.map(br => `${clg}${br}${year}${type}${startNum}-${endNum}`).join(', ');
    }
  }

  // Setup change event listeners to show/hide lateral inputs based on semester value
  function setupLateralToggle() {
    const checkSemester = () => {
      const sem = parseInt(semesterInput.value || '0', 10);
      if (sem >= 3) {
        lateralGroupContainer.style.display = 'flex';
      } else {
        lateralGroupContainer.style.display = 'none';
        includeLateralCheckbox.checked = false;
        lateralRangeGroup.classList.add('hidden');
        lateralRangeInput.required = false;
      }
    };

    semesterInput.addEventListener('input', checkSemester);
    semesterInput.addEventListener('change', checkSemester);

    checkSemester();

    includeLateralCheckbox.addEventListener('change', () => {
      if (includeLateralCheckbox.checked) {
        lateralRangeGroup.classList.remove('hidden');
        lateralRangeInput.required = true;
      } else {
        lateralRangeGroup.classList.add('hidden');
        lateralRangeInput.required = false;
      }
    });
  }

  // Returns sorted and branch-filtered student results array
  function getFilteredResults() {
    const filterVal = document.getElementById('branchFilter').value || 'ALL';
    let filtered = studentsResults;
    if (filterVal !== 'ALL') {
      filtered = studentsResults.filter(r => r && r.enrollId && r.enrollId.substring(4, 6).toUpperCase() === filterVal);
    }

    return [...filtered].sort((a, b) => {
      if (!a || !b) return 0;
      let valA = a[currentSortCol];
      let valB = b[currentSortCol];

      if (currentSortCol === 'sgpa' || currentSortCol === 'cgpa') {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
      } else {
        valA = String(valA || '').toUpperCase();
        valB = String(valB || '').toUpperCase();
      }

      if (valA < valB) return currentSortDir === 'asc' ? -1 : 1;
      if (valA > valB) return currentSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Updates status description text labels above the live results table
  function updateStatsCountsOnly() {
    const filtered = getFilteredResults();
    const successCount = filtered.filter(r => r && !r.error).length;
    const errorCount = filtered.filter(r => r && r.error).length;
    const totalCount = filtered.filter(r => r).length;

    if (totalCount === 0) {
      resultsCount.textContent = '0 student records found';
    } else {
      resultsCount.textContent = `${totalCount} student records found (${successCount} succeeded, ${errorCount} errors)`;
    }
  }

  // Synchronizes available branches select filter matching loaded student records
  function updateBranchFilterDropdown() {
    const branches = Array.from(new Set(studentsResults.map(r => r && r.enrollId ? r.enrollId.substring(4, 6).toUpperCase() : null).filter(Boolean))).sort();

    if (JSON.stringify(branches) === JSON.stringify(activeBranchesList)) {
      return;
    }
    activeBranchesList = branches;

    const select = document.getElementById('branchFilter');
    const wrapper = document.getElementById('branchFilterWrapper');
    const currentSelection = select.value || 'ALL';

    select.innerHTML = '<option value="ALL">All Branches</option>';

    if (branches.length > 1) {
      wrapper.classList.remove('hidden');
      branches.forEach(br => {
        const option = document.createElement('option');
        option.value = br;
        option.textContent = `${br} Branch`;
        if (br === currentSelection) option.selected = true;
        select.appendChild(option);
      });
    } else {
      wrapper.classList.add('hidden');
      select.value = 'ALL';
    }

    updateExportDropdown(branches);
  }

  // Updates export format items depending on available branch codes
  function updateExportDropdown(branches) {
    const menu = document.getElementById('exportDropdown');
    menu.innerHTML = '';

    const buildGroup = (label, branchVal) => {
      const header = document.createElement('div');
      header.className = 'dropdown-header';
      header.style.padding = '0.4rem 0.8rem 0.2rem 0.8rem';
      header.style.fontSize = '0.7rem';
      header.style.fontWeight = 'bold';
      header.style.textTransform = 'uppercase';
      header.style.color = 'var(--text-muted)';
      header.style.borderTop = menu.children.length > 0 ? '1px solid var(--border-color)' : 'none';
      header.style.marginTop = menu.children.length > 0 ? '0.3rem' : '0';
      header.textContent = label;
      menu.appendChild(header);

      const formats = [
        { type: 'xlsx', text: 'Excel Document (.xlsx)' },
        { type: 'csv', text: 'CSV Table (.csv)' },
        { type: 'json', text: 'JSON File (.json)' }
      ];

      formats.forEach(f => {
        const btn = document.createElement('button');
        btn.className = 'dropdown-item';
        btn.style.paddingLeft = '1.5rem';
        btn.style.fontSize = '0.8rem';
        btn.textContent = f.text;
        btn.addEventListener('click', () => {
          const courseId = courseSelect.value;
          const semester = semesterInput.value;
          window.open(`/api/scrape/export?format=${f.type}&courseId=${courseId}&sem=${semester}&branch=${branchVal}`, '_blank');
        });
        menu.appendChild(btn);
      });
    };

    if (branches.length > 1) {
      branches.forEach(br => {
        buildGroup(`${br} Branch`, br);
      });
      buildGroup('Combined (All)', 'ALL');
    } else {
      const br = branches[0] || 'ALL';
      buildGroup('Export', br);
    }
  }

  document.getElementById('branchFilter').addEventListener('change', () => {
    rebuildTable();
    calculateAnalytics();
  });

  // Saves setup forms values into localStorage
  function saveSetupState() {
    if (!rememberSetupCheckbox.checked) {
      localStorage.removeItem(SETUP_STORAGE_KEY);
      localStorage.setItem('remember_setup_enabled', 'false');
      return;
    }

    const state = {
      courseId: courseSelect.value,
      semester: semesterInput.value,
      concurrency: concurrencyInput.value,
      staggerDelay: staggerDelayInput.value,
      delay: delayInput.value,
      retries: retriesInput.value,
      useCache: cacheCheckbox.checked,
      college: collegeSelect.value,
      year: yearInput.value,
      branch: branchInput.value,
      rangeStart: rangeStartInput.value,
      rangeEnd: rangeEndInput.value,
      rollInput: rollInput.value,
      includeLateral: includeLateralCheckbox.checked,
      lateralRange: lateralRangeInput.value,
      inputMode: activeInputMode
    };

    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem('remember_setup_enabled', 'true');
  }

  // Restores setup forms values from localStorage
  function loadSetupState() {
    const enabled = localStorage.getItem('remember_setup_enabled') === 'true';
    rememberSetupCheckbox.checked = enabled;
    if (!enabled) return;

    try {
      const raw = localStorage.getItem(SETUP_STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);

      if (state.courseId) pendingSavedCourse = state.courseId;
      if (state.semester) semesterInput.value = state.semester;
      if (state.concurrency) concurrencyInput.value = state.concurrency;
      if (state.staggerDelay) staggerDelayInput.value = state.staggerDelay;
      if (state.delay) delayInput.value = state.delay;
      if (state.retries) retriesInput.value = state.retries;
      if (state.useCache !== undefined) cacheCheckbox.checked = state.useCache;
      if (state.college) pendingSavedCollege = state.college;
      if (state.year) yearInput.value = state.year;
      if (state.branch) branchInput.value = state.branch;
      if (state.rangeStart) rangeStartInput.value = state.rangeStart;
      if (state.rangeEnd) rangeEndInput.value = state.rangeEnd;
      if (state.rollInput) rollInput.value = state.rollInput;
      if (state.includeLateral !== undefined) includeLateralCheckbox.checked = state.includeLateral;
      if (state.lateralRange) lateralRangeInput.value = state.lateralRange;

      if (state.inputMode) {
        activeInputMode = state.inputMode;
        inputModeBtns.forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-mode') === activeInputMode);
        });
        if (activeInputMode === 'visual') {
          helperInputContainer.classList.remove('hidden');
          manualInputContainer.classList.add('hidden');
        } else {
          helperInputContainer.classList.add('hidden');
          manualInputContainer.classList.remove('hidden');
        }
      }

      semesterInput.dispatchEvent(new Event('change'));
      includeLateralCheckbox.dispatchEvent(new Event('change'));
      updateRangePreview();

    } catch (err) {
      console.error('Failed to load saved setup state:', err);
    }
  }

  const inputsToSave = [
    courseSelect, semesterInput, concurrencyInput, staggerDelayInput,
    delayInput, retriesInput, cacheCheckbox, collegeSelect, yearInput,
    branchInput, rangeStartInput, rangeEndInput, rollInput,
    includeLateralCheckbox, lateralRangeInput, rememberSetupCheckbox
  ];

  inputsToSave.forEach(input => {
    if (input) {
      input.addEventListener('change', saveSetupState);
      input.addEventListener('input', saveSetupState);
    }
  });

  inputModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeout(saveSetupState, 0);
    });
  });

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

  // GPU-friendly, high-performance Canvas Background Matrix animation engine
  class BackgroundMatrix {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.animationFrameId = null;
      this.active = false;
      this.mode = 'particles';
      this.speedMultiplier = 0.65;
      this.isBlast = false;

      // Load custom background matrix sizes
      this.idleSize = parseFloat(localStorage.getItem('rgpv_matrix_idle_size') || '200');
      this.activeSize = parseFloat(localStorage.getItem('rgpv_matrix_active_size') || '300');

      this.cycleInterval = null;
      this.modesList = ['particles', 'rings', 'waves', 'grid'];
      this.currentCycleIndex = 0;

      this.particles = [];
      this.maxParticles = 65;

      this.ringAngle = 0;
      this.waveOffset = 0;
      this.gridOffset = 0;

      window.addEventListener('resize', () => {
        if (this.active) this.resizeCanvas();
      });
    }

    resizeCanvas() {
      if (this.canvas) {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
      }
    }

    setMode(mode) {
      const oldMode = this.mode;
      this.mode = mode;

      if (mode !== 'random' && this.cycleInterval) {
        clearInterval(this.cycleInterval);
        this.cycleInterval = null;
      }

      if (mode === 'random' && oldMode !== 'random') {
        this.startCycleMode();
      }

      if (this.active) {
        this.initModeState();
      }
    }

    startCycleMode() {
      if (this.cycleInterval) clearInterval(this.cycleInterval);
      this.currentCycleIndex = 0;
      this.cycleInterval = setInterval(() => {
        if (!this.active) return;
        this.currentCycleIndex = (this.currentCycleIndex + 1) % this.modesList.length;
        this.initModeState();
      }, 15000); // Cycles every 15s
    }

    initModeState() {
      const activeMode = this.mode === 'random' ? this.modesList[this.currentCycleIndex] : this.mode;

      if (activeMode === 'particles') {
        this.particles = [];
        for (let i = 0; i < this.maxParticles; i++) {
          this.particles.push(new Particle(this.canvas.width, this.canvas.height));
        }
      }
    }

    start() {
      if (this.active) return;
      this.active = true;
      this.canvas.classList.add('active');
      this.resizeCanvas();

      const matrixBgEnabled = localStorage.getItem('rgpv_matrix_bg_enabled') !== 'false';
      const savedAnim = matrixBgEnabled ? (localStorage.getItem('rgpv_fetch_custom_anim') || 'particles') : 'none';
      this.setMode(savedAnim);

      this.initModeState();
      this.animate();
    }

    startCalm() {
      this.speedMultiplier = 0.65;
      this.isBlast = false;
      this.isMining = false;
      document.body.classList.remove('cyber-blast-active', 'cyber-drift-active');
    }

    startMining() {
      this.speedMultiplier = 2.8;
      this.isBlast = false;
      this.isMining = true;
      document.body.classList.remove('cyber-blast-active', 'cyber-drift-active');
    }

    triggerBlast(isAbort = false) {
      this.isBlast = true;
      this.isMining = false;
      if (isAbort) {
        this.speedMultiplier = 4.8;
        document.body.classList.remove('cyber-drift-active');
        document.body.classList.add('cyber-blast-active');
        setTimeout(() => {
          document.body.classList.remove('cyber-blast-active');
          this.startCalm();
        }, 2000); // Aggressive shake for aborted is 2s
      } else {
        this.speedMultiplier = 3.2;
        document.body.classList.remove('cyber-blast-active');
        document.body.classList.add('cyber-drift-active');
        setTimeout(() => {
          document.body.classList.remove('cyber-drift-active');
          this.startCalm();
        }, 1200); // Subtle drift for success is 1.2s
      }
    }

    stop() {
      // Runs continuously
    }

    animate() {
      if (!this.active && !this.animationFrameId) return;

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      const activeMode = this.mode === 'random' ? this.modesList[this.currentCycleIndex] : this.mode;
      const isDark = document.body.classList.contains('dark-theme');

      // Apply shadow glow in dark mode for extra tech aesthetics!
      if (isDark) {
        this.ctx.shadowBlur = this.isBlast ? 12 : 6;
        this.ctx.shadowColor = 'rgba(0, 240, 255, 0.65)';
      } else {
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';
      }

      if (activeMode === 'none') {
        // Render empty
      } else if (activeMode === 'particles') {
        this.drawParticles(isDark);
      } else if (activeMode === 'rings') {
        this.drawRings(isDark);
      } else if (activeMode === 'waves') {
        this.drawWaves(isDark);
      } else if (activeMode === 'grid') {
        this.drawGrid(isDark);
      }

      if (this.active || this.animationFrameId) {
        this.animationFrameId = requestAnimationFrame(() => this.animate());
      }
    }

    drawParticles(isDark) {
      const sizeFactor = (this.isMining ? this.activeSize : this.idleSize) / 100;
      const particleColor = isDark ? 'rgba(0, 240, 255, 0.65)' : 'rgba(37, 99, 235, 0.4)';
      const connectionDistance = (this.isBlast ? 180 : 115) * Math.sqrt(sizeFactor);

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.update(this.canvas.width, this.canvas.height, this.speedMultiplier);
        p.draw(this.ctx, particleColor, this.isBlast, sizeFactor);
      }

      this.ctx.lineWidth = (this.isBlast ? 2.5 : 1) * Math.sqrt(sizeFactor);
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const p1 = this.particles[i];
          const p2 = this.particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * (isDark ? (this.isBlast ? 0.55 : 0.28) : (this.isBlast ? 0.38 : 0.18));
            this.ctx.strokeStyle = isDark
              ? `rgba(0, 240, 255, ${alpha})`
              : `rgba(37, 99, 235, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
          }
        }
      }
    }

    drawRings(isDark) {
      const sizeFactor = (this.isMining ? this.activeSize : this.idleSize) / 100;
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;
      const maxRadius = Math.max(this.canvas.width, this.canvas.height) * (this.isBlast ? 0.8 : 0.65);

      this.ringAngle += (this.isBlast ? 0.012 : 0.003) * this.speedMultiplier;

      this.ctx.lineWidth = (this.isBlast ? 3.0 : 1.5) * Math.sqrt(sizeFactor);

      const numRings = this.isBlast ? 7 : 5;
      for (let i = 1; i <= numRings; i++) {
        const r = (maxRadius / numRings) * i;
        const alpha = (1 - (r / maxRadius)) * (isDark ? (this.isBlast ? 0.65 : 0.38) : (this.isBlast ? 0.45 : 0.22));
        this.ctx.strokeStyle = isDark
          ? `rgba(0, 240, 255, ${alpha})`
          : `rgba(37, 99, 235, ${alpha})`;

        const pulseRadius = r + Math.sin(this.ringAngle * 2 + i) * (this.isBlast ? 40 : 15);

        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(this.ringAngle * (i % 2 === 0 ? 1.5 : -1));

        this.ctx.fillStyle = isDark ? 'rgba(217, 70, 239, 0.68)' : 'rgba(14, 165, 233, 0.5)';
        this.ctx.beginPath();
        this.ctx.arc(pulseRadius, 0, (this.isBlast ? 8 : 4) * sizeFactor, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    }

    drawWaves(isDark) {
      const sizeFactor = (this.isMining ? this.activeSize : this.idleSize) / 100;
      this.waveOffset += (this.isBlast ? 0.05 : 0.015) * this.speedMultiplier;
      const waveCount = this.isBlast ? 5 : 3;

      for (let w = 0; w < waveCount; w++) {
        const alpha = (1 - w / waveCount) * (isDark ? (this.isBlast ? 0.55 : 0.28) : (this.isBlast ? 0.38 : 0.18));
        this.ctx.strokeStyle = isDark
          ? `rgba(217, 70, 239, ${alpha})`
          : `rgba(14, 165, 233, ${alpha})`;
        this.ctx.lineWidth = ((this.isBlast ? 3.5 : 1.8) - w * 0.4) * Math.sqrt(sizeFactor);

        this.ctx.beginPath();
        const amplitude = ((this.isBlast ? 75 : 30) + w * 15) * sizeFactor;
        const frequency = (0.0015 + w * 0.0005) / Math.sqrt(sizeFactor);

        for (let x = 0; x < this.canvas.width; x += 10) {
          const y = (this.canvas.height * 0.5) +
            Math.sin(x * frequency + this.waveOffset + w) * amplitude +
            Math.cos(x * 0.0008 - this.waveOffset * 0.5) * (amplitude * 0.5);

          if (x === 0) {
            this.ctx.moveTo(x, y);
          } else {
            this.ctx.lineTo(x, y);
          }
        }
        this.ctx.stroke();
      }
    }

    drawGrid(isDark) {
      const sizeFactor = (this.isMining ? this.activeSize : this.idleSize) / 100;
      this.gridOffset += (this.isBlast ? 4.5 : 1.2) * this.speedMultiplier;
      const cellWidth = 80 * sizeFactor;
      const cellHeight = 80 * sizeFactor;

      this.ctx.lineWidth = (this.isBlast ? 2.5 : 1) * Math.sqrt(sizeFactor);
      this.ctx.strokeStyle = isDark
        ? `rgba(0, 240, 255, ${this.isBlast ? 0.45 : 0.18})`
        : `rgba(37, 99, 235, ${this.isBlast ? 0.32 : 0.12})`;

      const horizon = this.canvas.height * (this.isBlast ? 0.3 : 0.45);
      const linesCount = 20;

      for (let i = 0; i < linesCount; i++) {
        const yRatio = i / linesCount;
        const y = horizon + Math.pow(yRatio, 2.5) * (this.canvas.height - horizon) + (this.gridOffset % cellHeight) * yRatio;
        if (y < horizon || y > this.canvas.height) continue;

        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.canvas.width, y);
        this.ctx.stroke();
      }

      const cols = 26;
      const centerX = this.canvas.width / 2;
      for (let i = -cols / 2; i <= cols / 2; i++) {
        const startX = centerX + i * cellWidth;
        const endX = centerX + i * cellWidth * 4;

        this.ctx.beginPath();
        this.ctx.moveTo(startX, horizon);
        this.ctx.lineTo(endX, this.canvas.height);
        this.ctx.stroke();
      }
    }
  }

  class Particle {
    constructor(w, h) {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.vx = (Math.random() - 0.5) * 1.6;
      this.vy = (Math.random() - 0.5) * 1.6;
      this.baseSize = Math.random() * 2.2 + 1.2;
      this.size = this.baseSize;
    }

    update(w, h, speedMult = 1.0) {
      this.x += this.vx * speedMult;
      this.y += this.vy * speedMult;

      if (this.x < 0) this.x = w;
      if (this.x > w) this.x = 0;
      if (this.y < 0) this.y = h;
      if (this.y > h) this.y = 0;
    }

    draw(ctx, color, isBlast = false, sizeFactor = 1.0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      const currentSize = (isBlast ? this.baseSize * 2.6 : this.baseSize) * sizeFactor;
      ctx.arc(this.x, this.y, currentSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Handles radial wave theme transitions (Cyber-ripple)
  function triggerRadialThemeTransition(isDark) {
    const ripple = document.createElement('div');
    ripple.className = 'theme-transition-ripple';

    // Set dynamic target background color matching light/dark base themes
    ripple.style.setProperty('--target-bg', isDark ? '#050811' : '#e8eff7');

    document.body.appendChild(ripple);

    // Force reflow
    ripple.offsetHeight;

    ripple.classList.add('active');

    setTimeout(() => {
      document.body.classList.toggle('dark-theme', isDark);
      const themeToggle = document.getElementById('themeToggle');
      const themeIcon = themeToggle?.querySelector('.theme-icon');
      if (themeIcon) {
        themeIcon.textContent = isDark ? '☀️' : '🌙';
      }

      const themeToggleLabel = document.getElementById('themeToggleLabel');
      if (themeToggleLabel) {
        themeToggleLabel.textContent = isDark ? 'Space Dark' : 'Light Blueprint';
      }

      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }, 1300);

    setTimeout(() => {
      ripple.classList.add('fade-out');
    }, 1800);

    setTimeout(() => {
      ripple.remove();
    }, 2600);
  }

});
