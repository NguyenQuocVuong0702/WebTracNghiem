/* script.js - Phiên bản FULL: Smart Shuffle + Giao diện Fix + Xem lại bài */

let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let userAnswers = []; // Biến quan trọng để lưu lịch sử làm bài
let allQuestionsFlat = [];
let questionBank = {};
let showTranslation = false;
const QUESTION_DATA_FILES = [
    './data/aws_de_01.json',
    './data/aws_de_02.json'
];
const WRONG_STATS_KEY = 'wrongQuestionStats';
const QUIZ_BATCH_SIZE_KEY = 'quizBatchSize';
const SHUFFLE_OPTIONS_KEY = 'shuffleOptions';
const MASTERED_STREAK = 3;

// DOM Elements
const dashboard = document.getElementById('dashboard');
const quizScreen = document.getElementById('quiz-screen');
const resultScreen = document.getElementById('result-screen');
const chapterList = document.getElementById('chapter-list'); // Lưu ý: Trong HTML ID này nằm trong dashboard
const questionText = document.getElementById('question-text');
const optionsGrid = document.getElementById('options-grid');
const progressBar = document.getElementById('progress-fill');
const nextBtn = document.getElementById('next-btn');
const confirmAnswerBtn = document.getElementById('confirm-answer-btn');
const finalScore = document.getElementById('final-score');
const shuffleToggle = document.getElementById('shuffle-toggle');
const shuffleOptionsToggle = document.getElementById('shuffle-options-toggle');
const languageSelect = document.getElementById('language-select');
const translationToggleBtn = document.getElementById('translation-toggle-btn');
const reviewArea = document.getElementById('review-area');
const DEFAULT_EXPLANATION = 'Câu này chưa có giải thích. Bạn có thể bổ sung trường explain trong dữ liệu câu hỏi.';
const explanationBox = document.createElement('div');
explanationBox.className = 'explanation-box';
explanationBox.style.display = 'none';

function getCurrentLanguage() {
    return languageSelect ? languageSelect.value : 'both';
}

function getQuizRenderLanguage() {
    return getCurrentLanguage() === 'en' && showTranslation ? 'both' : getCurrentLanguage();
}

function isLocalizedText(value) {
    return value && typeof value === 'object' && ('en' in value || 'vi' in value);
}

function getPlainText(value) {
    if (typeof value === 'string') return value;
    if (isLocalizedText(value)) return value.en || value.vi || '';
    if (value === null || value === undefined) return '';
    return String(value);
}

function getLocalizedText(value, lang = getCurrentLanguage()) {
    if (!isLocalizedText(value)) return getPlainText(value);
    if (lang === 'vi') return value.vi || value.en || '';
    return value.en || value.vi || '';
}

function areSameLocalizedText(left, right) {
    return (
        getLocalizedText(left, 'en').trim() === getLocalizedText(right, 'en').trim() &&
        getLocalizedText(left, 'vi').trim() === getLocalizedText(right, 'vi').trim()
    );
}

function appendLocalizedText(parent, value, lang = getCurrentLanguage()) {
    if (isLocalizedText(value) && lang === 'both') {
        const en = document.createElement('div');
        en.className = 'lang-line lang-en';
        en.textContent = value.en || value.vi || '';
        parent.appendChild(en);

        if (value.vi) {
            const vi = document.createElement('div');
            vi.className = 'lang-line lang-vi translation-text';
            vi.textContent = value.vi;
            parent.appendChild(vi);
        }
        return;
    }

    parent.textContent = getLocalizedText(value, lang);
}

function getAnswerDisplayText(value, lang = getCurrentLanguage()) {
    if (Array.isArray(value)) {
        return value.map(item => getAnswerDisplayText(item, lang)).join(', ');
    }

    if (isLocalizedText(value) && lang === 'both') {
        const en = value.en || value.vi || '';
        const vi = value.vi ? ` / ${value.vi}` : '';
        return `${en}${vi}`;
    }

    return getLocalizedText(value, lang);
}

function appendAnswerText(parent, value, lang = getCurrentLanguage()) {
    parent.textContent = getAnswerDisplayText(value, lang);
}

function appendChoiceExplanationLabel(parent, option, isCorrectChoice, lang = getCurrentLanguage()) {
    const statusEn = isCorrectChoice ? 'Correct' : 'Incorrect';
    const statusVi = isCorrectChoice ? 'Đúng' : 'Sai';

    if (isLocalizedText(option) && lang === 'both') {
        const en = document.createElement('div');
        en.className = 'lang-line lang-en';
        en.textContent = `${getLocalizedText(option, 'en')} (${statusEn})`;
        parent.appendChild(en);

        const vi = document.createElement('div');
        vi.className = 'lang-line lang-vi option-translation-text';
        vi.textContent = `${getLocalizedText(option, 'vi')} (${statusVi})`;
        parent.appendChild(vi);
        return;
    }

    const status = lang === 'vi' ? statusVi : statusEn;
    parent.textContent = `${getLocalizedText(option, lang)} (${status})`;
}

function updateTranslationToggle() {
    if (!translationToggleBtn) return;

    const isEnglishMode = getCurrentLanguage() === 'en';
    translationToggleBtn.style.display = isEnglishMode ? 'inline-flex' : 'none';
    translationToggleBtn.textContent = showTranslation ? 'Ẩn dịch' : 'Hiện dịch';
}

function getSavedBatchSizeValue() {
    const savedValue = localStorage.getItem(QUIZ_BATCH_SIZE_KEY);
    return ['25', '50', '65', 'all'].includes(savedValue) ? savedValue : '25';
}

function getSelectedBatchSize() {
    const value = getSavedBatchSizeValue();
    return value === 'all' ? allQuestionsFlat.length : Number(value);
}

function normalizeAnswerValue(raw) {
    const answer = raw.a !== undefined ? raw.a : raw.answer;
    return Array.isArray(answer) ? answer.map(Number) : answer;
}

function getQuestionType(answer) {
    return Array.isArray(answer) ? 'multiple' : 'single';
}

function isMultipleQuestion(question) {
    return question && question.type === 'multiple';
}

function arraysEqualAsSets(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    const leftSet = new Set(left);
    if (leftSet.size !== right.length) return false;
    return right.every(item => leftSet.has(item));
}

function isShuffleOptionsEnabled() {
    return localStorage.getItem(SHUFFLE_OPTIONS_KEY) !== 'false';
}

function setupShuffleOptionsToggle() {
    if (!shuffleOptionsToggle) return;

    shuffleOptionsToggle.checked = isShuffleOptionsEnabled();
    shuffleOptionsToggle.onchange = () => {
        localStorage.setItem(SHUFFLE_OPTIONS_KEY, shuffleOptionsToggle.checked ? 'true' : 'false');
    };
}

function makeDisplayQuestionId(source, index, question) {
    const stableId = question && question.id !== undefined ? question.id : index;
    return `${source}::${stableId}::${getPlainText(question && question.q)}`;
}

function getShortExplanation(explain) {
    if (!explain) return explain;
    if (isLocalizedText(explain) || typeof explain === 'string') return explain;
    return explain.short || explain.full || explain;
}

function getFullExplanation(raw) {
    if (raw.fullExplain) return raw.fullExplain;
    if (!raw.explain || isLocalizedText(raw.explain) || typeof raw.explain === 'string') return null;
    return raw.explain.full || null;
}

function normalizeQuestion(raw, source, index) {
    const answer = normalizeAnswerValue(raw);
    const question = {
        id: raw.id,
        topic: raw.topic,
        level: raw.level,
        q: raw.q,
        o: raw.o || raw.options || [],
        a: answer,
        type: getQuestionType(answer),
        explain: getShortExplanation(raw.explain),
        fullExplain: getFullExplanation(raw),
        choicesExplain: raw.choicesExplain || raw.wrongExplain,
        refs: raw.refs || [],
        __source: source
    };

    question.__id = makeDisplayQuestionId(source, index, question);
    return question;
}

function showDashboardMessage(message, type = 'info') {
    showScreen(dashboard);
    const listContainer = document.getElementById('chapter-list') || dashboard;
    listContainer.innerHTML = '';

    const messageBox = document.createElement('div');
    messageBox.className = `dashboard-message ${type}`;
    messageBox.textContent = message;
    listContainer.appendChild(messageBox);
}

async function loadQuestionBank() {
    showDashboardMessage('Đang tải dữ liệu câu hỏi...', 'info');
    const loadedBank = {};

    try {
        for (const filePath of QUESTION_DATA_FILES) {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`${filePath}: HTTP ${response.status}`);
            }

            const data = await response.json();
            const title = data.title || filePath;
            const rawQuestions = Array.isArray(data.questions) ? data.questions : [];

            loadedBank[title] = rawQuestions.map((raw, index) => normalizeQuestion(raw, title, index));
        }

        questionBank = loadedBank;
        initDashboard();
    } catch (error) {
        console.error('Không thể tải dữ liệu câu hỏi:', error);
        showDashboardMessage(
            'Không thể tải dữ liệu câu hỏi. Hãy chạy web bằng Live Server và kiểm tra file JSON trong thư mục data.',
            'error'
        );
    }
}

// 1. Khởi tạo Dashboard
function initDashboard() {
    showScreen(dashboard);
    setupShuffleOptionsToggle();
    
    // Tìm element chứa danh sách (nếu HTML cấu trúc khác thì fallback về dashboard)
    const listContainer = document.getElementById('chapter-list') || dashboard;
    listContainer.innerHTML = '';
    
    if (!questionBank || Object.keys(questionBank).length === 0) {
        showDashboardMessage('Chưa có dữ liệu câu hỏi để hiển thị.', 'error');
        return;
    }

    // Làm phẳng mảng câu hỏi
    allQuestionsFlat = [];
    for (const [chapter, questions] of Object.entries(questionBank)) {
        questions.forEach((q, index) => allQuestionsFlat.push(withQuestionMeta(q, chapter, index)));
    }

    // --- Card 1: Thi Thử Thông Minh (Giao diện đã sửa) ---
    const totalQ = allQuestionsFlat.length;
    let savedQueue = JSON.parse(localStorage.getItem('quizQueue')) || [];
    savedQueue = savedQueue.filter(index => Number.isInteger(index) && index >= 0 && index < totalQ);
    localStorage.setItem('quizQueue', JSON.stringify(savedQueue));
    const remainQ = savedQueue.length;
    const isNewLoop = remainQ === 0 || remainQ === totalQ;
    const savedBatchSizeValue = getSavedBatchSizeValue();
    
    const statusText = isNewLoop 
        ? `<span style="color:var(--success)">● Bắt đầu vòng mới</span>` 
        : `<span style="color:#e67e22">● Còn ${remainQ} câu chưa làm</span>`;

    const randomCard = document.createElement('div');
    randomCard.className = 'chapter-card';
    randomCard.style.cssText = "border-left: 5px solid #fdcb6e; display: flex; align-items: center; justify-content: space-between; padding: 15px;";
    
    randomCard.innerHTML = `
        <div style="flex: 1">
            <span class="chapter-title" style="font-size: 1.1rem; display: block; margin-bottom: 5px;">
                <i class="fas fa-bolt" style="color:#fdcb6e"></i> THI THỬ THÔNG MINH
            </span>
            <div style="font-size: 0.85rem; color: #666;">
                ${statusText}
            </div>
        </div>

        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <label class="batch-size-picker">
                <span>Số câu</span>
                <select id="batch-size-select">
                    <option value="25" ${savedBatchSizeValue === '25' ? 'selected' : ''}>25 câu</option>
                    <option value="50" ${savedBatchSizeValue === '50' ? 'selected' : ''}>50 câu</option>
                    <option value="65" ${savedBatchSizeValue === '65' ? 'selected' : ''}>65 câu</option>
                    <option value="all" ${savedBatchSizeValue === 'all' ? 'selected' : ''}>Toàn bộ</option>
                </select>
            </label>
            <button id="reset-btn" style="padding: 5px 10px; font-size: 0.8rem; border: 1px solid #dfe6e9; background: white; border-radius: 4px; cursor: pointer; color: #636e72; transition: all 0.2s;">
                <i class="fas fa-sync-alt"></i> Reset vòng
            </button>
        </div>
    `;
    
    // Xử lý nút Reset
    const btnReset = randomCard.querySelector('#reset-btn');
    const batchSizeSelect = randomCard.querySelector('#batch-size-select');
    batchSizeSelect.onclick = (e) => e.stopPropagation();
    batchSizeSelect.onmousedown = (e) => e.stopPropagation();
    batchSizeSelect.onchange = (e) => {
        e.stopPropagation();
        localStorage.setItem(QUIZ_BATCH_SIZE_KEY, batchSizeSelect.value);
    };
    btnReset.onclick = (e) => {
        e.stopPropagation();
        if(confirm('Bạn muốn đặt lại từ đầu (coi như chưa làm câu nào)?')) {
            localStorage.removeItem('quizQueue');
            initDashboard();
        }
    };
    btnReset.onmouseover = () => { btnReset.style.background = '#d63031'; btnReset.style.color = 'white'; btnReset.style.borderColor = '#d63031'; };
    btnReset.onmouseout = () => { btnReset.style.background = 'white'; btnReset.style.color = '#636e72'; btnReset.style.borderColor = '#dfe6e9'; };
    
    randomCard.onclick = () => startSmartQuiz();
    listContainer.appendChild(randomCard);

    const wrongStats = getWrongStatsList();
    const activeWrongStats = wrongStats.filter(item => !item.mastered);
    const masteredStats = wrongStats.filter(item => item.mastered);
    const wrongCard = document.createElement('div');
    wrongCard.className = activeWrongStats.length ? 'chapter-card wrong-card' : 'chapter-card wrong-card disabled-card';
    wrongCard.innerHTML = `
        <div style="flex: 1">
            <span class="chapter-title" style="font-size: 1.1rem; display: block; margin-bottom: 5px;">
                <i class="fas fa-bullseye"></i> ÔN CÂU SAI
            </span>
            <div class="wrong-summary">
                ${activeWrongStats.length} câu cần ôn - ${masteredStats.length} câu đã cải thiện
            </div>
        </div>
        <span class="chapter-count wrong-count">${Math.min(activeWrongStats.length, 25)} câu / lượt</span>
    `;
    wrongCard.onclick = () => startWrongQuiz();
    listContainer.appendChild(wrongCard);

    // --- Các Card Chương ---
    for (const [chapter, questions] of Object.entries(questionBank)) {
        const card = document.createElement('div');
        card.className = 'chapter-card';
        card.innerHTML = `
            <span class="chapter-title">${chapter}</span>
            <span class="chapter-count">${questions.length} câu</span>
        `;
        card.onclick = () => startQuiz(questions.map((q, index) => withQuestionMeta(q, chapter, index)));
        listContainer.appendChild(card);
    }
}

// 2. Thuật toán Smart Shuffle
function makeQuestionId(source, index, questionText) {
    return `${source}::${index}::${getPlainText(questionText)}`;
}

function withQuestionMeta(question, source, index) {
    return {
        ...question,
        __source: question.__source || source,
        __id: question.__id || makeDisplayQuestionId(source, index, question)
    };
}

function readWrongStats() {
    try {
        return JSON.parse(localStorage.getItem(WRONG_STATS_KEY)) || {};
    } catch (error) {
        return {};
    }
}

function saveWrongStats(stats) {
    localStorage.setItem(WRONG_STATS_KEY, JSON.stringify(stats));
}

function getCurrentQuestionIdSet() {
    const currentIds = new Set();

    for (const [chapter, questions] of Object.entries(questionBank || {})) {
        questions.forEach((question, index) => {
            currentIds.add(withQuestionMeta(question, chapter, index).__id);
        });
    }

    return currentIds;
}

function getWrongStatsList() {
    const currentQuestionIds = getCurrentQuestionIdSet();

    return Object.values(readWrongStats())
    .filter(item => currentQuestionIds.has(item.id))
    .sort((a, b) => {
        if (!!a.mastered !== !!b.mastered) return a.mastered ? 1 : -1;
        if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
        return (b.lastWrongAt || '').localeCompare(a.lastWrongAt || '');
    });
}

function recordQuestionResult(question, selectedIndex, isCorrect) {
    const stats = readWrongStats();
    const id = question.__id || makeDisplayQuestionId(question.__source || 'unknown', 0, question);
    const existing = stats[id];
    const now = new Date().toISOString();

    if (!isCorrect) {
        stats[id] = {
            id,
            source: question.__source || 'Không rõ đề',
            question: question.q,
            options: question.o,
            answerIndex: question.a,
            type: question.type,
            explain: question.explain,
            fullExplain: question.fullExplain,
            choicesExplain: question.choicesExplain,
            refs: question.refs,
            wrongCount: existing ? existing.wrongCount + 1 : 1,
            correctReviewCount: 0,
            lastSelectedIndex: selectedIndex,
            lastWrongAt: now,
            lastSeenAt: now,
            mastered: false
        };
        saveWrongStats(stats);
        return;
    }

    if (existing) {
        existing.correctReviewCount = (existing.correctReviewCount || 0) + 1;
        existing.lastSeenAt = now;
        existing.mastered = existing.correctReviewCount >= MASTERED_STREAK;
        stats[id] = existing;
        saveWrongStats(stats);
    }
}

function startWrongQuiz() {
    const activeWrongStats = getWrongStatsList().filter(item => !item.mastered);

    if (activeWrongStats.length === 0) {
        alert('Chưa có câu sai nào cần ôn. Làm vài lượt trước đã.');
        return;
    }

    const questionsToPlay = activeWrongStats.slice(0, 25).map(item => ({
        q: item.question,
        o: item.options,
        a: item.answerIndex,
        type: item.type || getQuestionType(item.answerIndex),
        explain: item.explain,
        fullExplain: item.fullExplain,
        choicesExplain: item.choicesExplain,
        refs: item.refs,
        __source: item.source,
        __id: item.id
    }));

    startQuiz(questionsToPlay, false);
}

function startSmartQuiz() {
    const selectedBatchValue = getSavedBatchSizeValue();
    const batchSize = getSelectedBatchSize();

    if (selectedBatchValue === 'all') {
        const questionsToPlay = createShuffledIndices(allQuestionsFlat.length).map(index => allQuestionsFlat[index]);
        startQuiz(questionsToPlay, false);
        return;
    }

    let queue = JSON.parse(localStorage.getItem('quizQueue')) || [];
    queue = queue.filter(index => Number.isInteger(index) && index >= 0 && index < allQuestionsFlat.length);

    if (queue.length === 0) {
        queue = createShuffledIndices(allQuestionsFlat.length);
    }

    let selectedIndices = [];

    if (queue.length >= batchSize) {
        selectedIndices = queue.slice(0, batchSize);
        queue = queue.slice(batchSize);
    } else {
        const remainingCount = queue.length;
        const needMore = batchSize - remainingCount;
        selectedIndices = [...queue];
        
        let newCycle = createShuffledIndices(allQuestionsFlat.length);
        const validNewQuestions = newCycle.filter(idx => !selectedIndices.includes(idx));
        const additionalIndices = validNewQuestions.slice(0, needMore);
        
        selectedIndices = selectedIndices.concat(additionalIndices);
        queue = validNewQuestions.slice(needMore);
    }

    localStorage.setItem('quizQueue', JSON.stringify(queue));
    const questionsToPlay = selectedIndices.map(index => allQuestionsFlat[index]);
    
    startQuiz(questionsToPlay, false);
}

function createShuffledIndices(count) {
    let arr = Array.from({length: count}, (_, i) => i);
    return arr.sort(() => Math.random() - 0.5);
}

function shuffleArray(items) {
    return [...items].sort(() => Math.random() - 0.5);
}

function buildDisplayOptions(question) {
    const displayOptions = question.o.map((option, index) => ({
        option,
        originalIndex: index,
        explain: Array.isArray(question.choicesExplain) ? question.choicesExplain[index] : null
    }));

    return isShuffleOptionsEnabled() ? shuffleArray(displayOptions) : displayOptions;
}

function getCorrectOriginalIndices(question) {
    return Array.isArray(question.a) ? [...question.a] : [question.a];
}

function getCorrectDisplayIndices(question) {
    const correctIndices = getCorrectOriginalIndices(question);
    return question.__displayOptions
        .map((item, index) => correctIndices.includes(item.originalIndex) ? index : -1)
        .filter(index => index !== -1);
}

function getCorrectDisplayIndex(question) {
    return getCorrectDisplayIndices(question)[0];
}

// 3. Logic Bắt đầu Quiz
function startQuiz(questions, shouldShuffle = true) {
    currentQuestions = JSON.parse(JSON.stringify(questions));
    
    // Trộn nếu cần (Thi thử thông minh thì không trộn lại vì đã trộn rồi)
    if (shouldShuffle && shuffleToggle && shuffleToggle.checked) {
        currentQuestions.sort(() => Math.random() - 0.5);
    }

    resetQuizState();
    showScreen(quizScreen);
    loadQuestion();
}

function resetQuizState() {
    currentQuestionIndex = 0;
    score = 0;
    userAnswers = []; // Reset lịch sử làm bài
    if(reviewArea) reviewArea.innerHTML = ''; 
    progressBar.style.width = '0%';
}

// 4. Hiển thị câu hỏi
function renderQuestionText(q) {
    const renderLanguage = getQuizRenderLanguage();

    questionText.innerHTML = '';
    const questionPrefix = document.createElement('span');
    questionPrefix.className = 'question-prefix';
    questionPrefix.textContent = `Câu ${currentQuestionIndex + 1}/${currentQuestions.length}: `;
    questionText.appendChild(questionPrefix);

    const questionContent = document.createElement('span');
    questionContent.className = 'question-content';
    appendLocalizedText(questionContent, q.q, renderLanguage);
    questionText.appendChild(questionContent);
}

function getCurrentAnswerState() {
    return userAnswers[currentQuestionIndex] || null;
}

function renderOptions(q) {
    const renderLanguage = getQuizRenderLanguage();
    const answerState = getCurrentAnswerState();
    const displayOptions = q.__displayOptions || buildDisplayOptions(q);
    q.__displayOptions = displayOptions;
    q.__selectedOriginalIndices = q.__selectedOriginalIndices || [];

    optionsGrid.innerHTML = '';

    displayOptions.forEach((displayOption, displayIndex) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        appendLocalizedText(btn, displayOption.option, renderLanguage);
        btn.onclick = () => {
            if (isMultipleQuestion(q)) {
                toggleMultipleOption(q, displayOption.originalIndex);
                renderOptions(q);
                return;
            }

            checkAnswer(btn, displayIndex);
        };

        if (answerState) {
            btn.disabled = true;
            const correctIndices = getCorrectOriginalIndices(q);
            const selectedIndices = Array.isArray(answerState.selectedIndex)
                ? answerState.selectedIndex
                : [answerState.selectedIndex];

            if (correctIndices.includes(displayOption.originalIndex)) {
                btn.classList.add('correct');
            } else if (selectedIndices.includes(displayOption.originalIndex)) {
                btn.classList.add('wrong');
            }
        } else if (isMultipleQuestion(q) && q.__selectedOriginalIndices.includes(displayOption.originalIndex)) {
            btn.classList.add('selected');
        }

        optionsGrid.appendChild(btn);
    });
}

function toggleMultipleOption(question, originalIndex) {
    question.__selectedOriginalIndices = question.__selectedOriginalIndices || [];

    if (question.__selectedOriginalIndices.includes(originalIndex)) {
        question.__selectedOriginalIndices = question.__selectedOriginalIndices.filter(index => index !== originalIndex);
        return;
    }

    question.__selectedOriginalIndices.push(originalIndex);
}

function refreshCurrentQuestionText() {
    const q = currentQuestions[currentQuestionIndex];
    if (!q) return;

    renderQuestionText(q);
    renderOptions(q);
    updateTranslationToggle();

    if (getCurrentAnswerState()) {
        showExplanation(q);
    }
}

function loadQuestion() {
    const q = currentQuestions[currentQuestionIndex];
    showTranslation = false;
    q.__showFullExplanation = false;
    q.__displayOptions = buildDisplayOptions(q);
    q.__selectedOriginalIndices = [];
    updateTranslationToggle();
    renderQuestionText(q);
    renderOptions(q);
    hideExplanation();
    confirmAnswerBtn.style.display = isMultipleQuestion(q) ? 'inline-block' : 'none';
    nextBtn.style.display = 'none'; 

    const progress = ((currentQuestionIndex) / currentQuestions.length) * 100;
    progressBar.style.width = `${progress}%`;
}

// 5. Kiểm tra đáp án & Lưu lịch sử
function getQuestionExplanation(question) {
    return question && question.explain ? question.explain : DEFAULT_EXPLANATION;
}

function appendExplanationSection(parent, titleText, contentValue, lang = getCurrentLanguage()) {
    const section = document.createElement('div');
    section.className = 'explanation-section';

    const title = document.createElement('div');
    title.className = 'explanation-subtitle';
    title.textContent = titleText;
    section.appendChild(title);

    const content = document.createElement('div');
    content.className = 'explanation-content';
    appendLocalizedText(content, contentValue, lang);
    section.appendChild(content);
    parent.appendChild(section);
}

function hasFullExplanationContent(question) {
    return !!(
        question &&
        (
            (question.fullExplain && !areSameLocalizedText(question.fullExplain, question.explain)) ||
            (Array.isArray(question.choicesExplain) && question.choicesExplain.length > 0) ||
            (Array.isArray(question.refs) && question.refs.length > 0)
        )
    );
}

function renderChoicesExplanation(parent, question, lang) {
    const explanationItems = question.__displayOptions || (
        Array.isArray(question.choicesExplain)
            ? question.choicesExplain.map((explain, index) => ({
                explain,
                originalIndex: index
            }))
            : []
    );

    if (explanationItems.length === 0) return;

    const choicesList = document.createElement('div');
    choicesList.className = 'choices-explain';

    explanationItems.forEach((explanationItem, index) => {
        const choiceExplain = explanationItem.explain;
        if (!choiceExplain) return;
        const choiceItem = document.createElement('div');
        choiceItem.className = 'choice-explain-item';
        const correctIndices = getCorrectOriginalIndices(question);
        const isCorrectChoice = correctIndices.includes(explanationItem.originalIndex);

        const label = document.createElement('div');
        label.className = 'choice-explain-label';
        appendChoiceExplanationLabel(label, explanationItem.option || question.o[explanationItem.originalIndex], isCorrectChoice, lang);
        choiceItem.appendChild(label);

        const content = document.createElement('div');
        content.className = 'choice-explain-content';
        appendLocalizedText(content, choiceExplain, lang);
        choiceItem.appendChild(content);
        choicesList.appendChild(choiceItem);
    });

    if (choicesList.childElementCount > 0) {
        const subtitle = document.createElement('div');
        subtitle.className = 'explanation-subtitle';
        subtitle.textContent = 'Giải thích từng đáp án';
        parent.appendChild(subtitle);
        parent.appendChild(choicesList);
    }
}

function renderRefs(parent, question) {
    if (!Array.isArray(question.refs) || question.refs.length === 0) return;

    const refs = document.createElement('div');
    refs.className = 'refs-list';

    const refsTitle = document.createElement('div');
    refsTitle.className = 'explanation-subtitle';
    refsTitle.textContent = 'Tham khảo';
    refs.appendChild(refsTitle);

    question.refs.forEach(ref => {
        if (!ref) return;
        const link = document.createElement('a');
        link.href = ref;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = ref;
        refs.appendChild(link);
    });

    if (refs.childElementCount > 1) {
        parent.appendChild(refs);
    }
}

function renderFullExplanation(container, question, lang = getQuizRenderLanguage()) {
    if (question.fullExplain && !areSameLocalizedText(question.fullExplain, question.explain)) {
        appendExplanationSection(container, 'Giải thích đầy đủ', question.fullExplain, lang);
    }

    renderChoicesExplanation(container, question, lang);
    renderRefs(container, question);
}

// Hiển thị giải thích sau khi người dùng đã chọn đáp án.
function showExplanation(question) {
    const renderLanguage = getQuizRenderLanguage();
    const isFullVisible = !!question.__showFullExplanation;
    explanationBox.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'explanation-title';
    title.textContent = '💡 Giải thích nhanh';

    explanationBox.appendChild(title);
    appendExplanationSection(explanationBox, 'Tổng quan', getQuestionExplanation(question), renderLanguage);

    if (hasFullExplanationContent(question)) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'full-explanation-toggle';
        toggleBtn.type = 'button';
        toggleBtn.textContent = isFullVisible ? 'Ẩn giải thích đầy đủ' : 'Xem giải thích đầy đủ';
        toggleBtn.onclick = () => {
            question.__showFullExplanation = !question.__showFullExplanation;
            showExplanation(question);
        };
        explanationBox.appendChild(toggleBtn);
    }

    if (isFullVisible) {
        renderFullExplanation(explanationBox, question, renderLanguage);
    }

    explanationBox.style.display = 'block';
}

function hideExplanation() {
    explanationBox.innerHTML = '';
    explanationBox.style.display = 'none';

    if (optionsGrid && explanationBox.parentElement !== optionsGrid.parentElement) {
        optionsGrid.insertAdjacentElement('afterend', explanationBox);
    }
}

function getOptionsByOriginalIndices(question, indices) {
    const indexList = Array.isArray(indices) ? indices : [indices];
    return indexList.map(index => question.o[index]).filter(option => option !== undefined);
}

function saveUserAnswer(question, selectedIndex, isCorrect, extra = {}) {
    const selectedOptions = getOptionsByOriginalIndices(question, selectedIndex);
    const correctIndex = question.a;
    const correctOptions = getOptionsByOriginalIndices(question, correctIndex);

    userAnswers.push({
        question: question.q,
        source: question.__source,
        selected: Array.isArray(selectedIndex) ? selectedOptions : selectedOptions[0],
        correct: Array.isArray(correctIndex) ? correctOptions : correctOptions[0],
        selectedIndex,
        correctIndex,
        isCorrect: isCorrect,
        explain: question.explain,
        fullExplain: question.fullExplain,
        choicesExplain: question.choicesExplain,
        refs: question.refs,
        options: question.o, // Lưu cả các option để hiển thị lại nếu cần
        displayOptions: question.__displayOptions,
        type: question.type,
        ...extra
    });
}

function checkAnswer(selectedBtn, selectedDisplayIndex) {
    const buttons = optionsGrid.querySelectorAll('.option-btn');
    buttons.forEach(btn => btn.disabled = true);

    const currentQuestion = currentQuestions[currentQuestionIndex];
    const displayOptions = currentQuestion.__displayOptions || buildDisplayOptions(currentQuestion);
    currentQuestion.__displayOptions = displayOptions;

    const selectedDisplayOption = displayOptions[selectedDisplayIndex];
    const selectedOriginalIndex = selectedDisplayOption.originalIndex;
    const correctOriginalIndex = currentQuestion.a;
    const correctDisplayIndex = getCorrectDisplayIndex(currentQuestion);
    const isCorrect = selectedOriginalIndex === correctOriginalIndex;

    recordQuestionResult(currentQuestion, selectedOriginalIndex, isCorrect);
    saveUserAnswer(currentQuestion, selectedOriginalIndex, isCorrect, {
        selectedDisplayIndex,
        correctDisplayIndex
    });

    if (isCorrect) {
        selectedBtn.classList.add('correct');
        score++;
    } else {
        selectedBtn.classList.add('wrong');
        if (buttons[correctDisplayIndex]) {
            buttons[correctDisplayIndex].classList.add('correct');
        }
    }

    showExplanation(currentQuestion);
    confirmAnswerBtn.style.display = 'none';
    nextBtn.style.display = 'inline-block';
}

function confirmMultipleAnswer() {
    const currentQuestion = currentQuestions[currentQuestionIndex];
    const selectedOriginalIndices = currentQuestion.__selectedOriginalIndices || [];

    if (selectedOriginalIndices.length === 0) {
        alert('Hãy chọn ít nhất một đáp án.');
        return;
    }

    const selectedIndices = [...selectedOriginalIndices].sort((a, b) => a - b);
    const correctIndices = getCorrectOriginalIndices(currentQuestion).sort((a, b) => a - b);
    const isCorrect = arraysEqualAsSets(selectedIndices, correctIndices);

    recordQuestionResult(currentQuestion, selectedIndices, isCorrect);
    saveUserAnswer(currentQuestion, selectedIndices, isCorrect);

    renderOptions(currentQuestion);
    showExplanation(currentQuestion);
    confirmAnswerBtn.style.display = 'none';
    nextBtn.style.display = 'inline-block';

    if (isCorrect) {
        score++;
    }
}

// 6. Chuyển câu
if (confirmAnswerBtn) {
    confirmAnswerBtn.onclick = () => confirmMultipleAnswer();
}

nextBtn.onclick = () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < currentQuestions.length) {
        loadQuestion();
    } else {
        showResult();
    }
};

// 7. Kết quả & Xem lại
function showResult() {
    showScreen(resultScreen);
    finalScore.textContent = `${score}/${currentQuestions.length}`;
    renderWrongProgressSummary();
    
    // Reload lại dashboard ngầm để cập nhật số câu còn lại
    // initDashboard(); // Không gọi ở đây vì sẽ làm mất màn hình kết quả
}

// Hàm được gọi khi bấm nút "Xem lại bài"
function renderWrongProgressSummary() {
    if (!reviewArea) return;

    const stats = getWrongStatsList();
    const activeCount = stats.filter(item => !item.mastered).length;
    const masteredCount = stats.filter(item => item.mastered).length;

    reviewArea.innerHTML = `
        <div class="progress-summary">
            <strong>Tiến độ lỗi sai:</strong>
            ${activeCount} câu cần ôn, ${masteredCount} câu đã cải thiện.
            <span>Trả lời đúng lại ${MASTERED_STREAK} lần để một câu được tính là đã cải thiện.</span>
        </div>
    `;
}

function reviewQuiz() {
    if (!reviewArea) return;
    renderWrongProgressSummary();
    reviewArea.insertAdjacentHTML('beforeend', '<h3>Chi tiết bài làm:</h3>');
    
    userAnswers.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'review-item';

        const questionLine = document.createElement('div');
        questionLine.className = 'review-q';
        const questionLabel = document.createElement('strong');
        questionLabel.textContent = `Câu ${index + 1}: `;
        questionLine.appendChild(questionLabel);
        const questionValue = document.createElement('span');
        appendLocalizedText(questionValue, item.question);
        questionLine.appendChild(questionValue);
        div.appendChild(questionLine);

        const source = document.createElement('div');
        source.className = 'review-source';
        source.textContent = item.source || '';
        div.appendChild(source);

        const answer = document.createElement('div');
        answer.className = 'review-a';
        answer.appendChild(document.createTextNode('Bạn chọn: '));
        const selected = document.createElement('span');
        selected.className = item.isCorrect ? 'text-green' : 'text-red';
        appendAnswerText(selected, item.selected || 'Không chọn');
        answer.appendChild(selected);

        if (!item.isCorrect) {
            answer.appendChild(document.createElement('br'));
            answer.appendChild(document.createTextNode('Đáp án đúng: '));
            const correct = document.createElement('span');
            correct.className = 'text-green';
            appendAnswerText(correct, item.correct);
            answer.appendChild(correct);
        }
        div.appendChild(answer);

        const reviewExplanation = document.createElement('div');
        reviewExplanation.className = 'review-explanation';
        appendExplanationSection(reviewExplanation, 'Tổng quan', getQuestionExplanation(item));

        if (item.fullExplain && !areSameLocalizedText(item.fullExplain, item.explain)) {
            appendExplanationSection(reviewExplanation, 'Giải thích đầy đủ', item.fullExplain);
        }

        if (Array.isArray(item.choicesExplain) && item.choicesExplain.length > 0) {
            const choicesList = document.createElement('div');
            choicesList.className = 'choices-explain';
            item.choicesExplain.forEach((choiceExplain, choiceIndex) => {
                if (!choiceExplain) return;
                const choiceItem = document.createElement('div');
                choiceItem.className = 'choice-explain-item';

                const label = document.createElement('div');
                label.className = 'choice-explain-label';
                const correctIndices = Array.isArray(item.correctIndex) ? item.correctIndex : [item.correctIndex];
                appendChoiceExplanationLabel(label, item.options[choiceIndex], correctIndices.includes(choiceIndex));
                choiceItem.appendChild(label);

                const content = document.createElement('div');
                content.className = 'choice-explain-content';
                appendLocalizedText(content, choiceExplain);
                choiceItem.appendChild(content);
                choicesList.appendChild(choiceItem);
            });

            if (choicesList.childElementCount > 0) {
                const subtitle = document.createElement('div');
                subtitle.className = 'explanation-subtitle';
                subtitle.textContent = 'Giải thích từng đáp án';
                reviewExplanation.appendChild(subtitle);
                reviewExplanation.appendChild(choicesList);
            }
        }

        if (Array.isArray(item.refs) && item.refs.length > 0) {
            const refs = document.createElement('div');
            refs.className = 'refs-list';
            const refsTitle = document.createElement('div');
            refsTitle.className = 'explanation-subtitle';
            refsTitle.textContent = 'Tham khảo';
            refs.appendChild(refsTitle);
            item.refs.forEach(ref => {
                if (!ref) return;
                const link = document.createElement('a');
                link.href = ref;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = ref;
                refs.appendChild(link);
            });
            if (refs.childElementCount > 1) {
                reviewExplanation.appendChild(refs);
            }
        }

        div.appendChild(reviewExplanation);
        reviewArea.appendChild(div);
    });
    
    reviewArea.scrollIntoView({ behavior: 'smooth' });
}

// 8. Điều hướng
function showScreen(screen) {
    dashboard.style.display = 'none';
    quizScreen.style.display = 'none';
    resultScreen.style.display = 'none';
    
    if(screen === quizScreen) {
        screen.style.display = 'flex';
        screen.style.flexDirection = 'column';
    } else {
        screen.style.display = 'block';
    }
}

function goHome() {
    if(confirm('Về màn hình chính? (Lưu ý: Kết quả lượt này sẽ không được lưu để xem lại nữa)')) {
        initDashboard(); // Refresh lại trạng thái
    }
}

// Sự kiện cho nút Về trang chủ ở màn kết quả
document.querySelector('.action-btn.home').onclick = () => {
    initDashboard();
};

if (translationToggleBtn) {
    translationToggleBtn.onclick = () => {
        if (getCurrentLanguage() !== 'en') return;
        showTranslation = !showTranslation;
        refreshCurrentQuestionText();
    };
}

if (languageSelect) {
    languageSelect.onchange = () => {
        if (getCurrentLanguage() !== 'en') {
            showTranslation = false;
        }

        if (currentQuestions.length > 0 && quizScreen.style.display !== 'none') {
            refreshCurrentQuestionText();
        } else {
            updateTranslationToggle();
        }
    };
}

// Chạy lần đầu sau khi dữ liệu JSON đã được tải xong.
loadQuestionBank();
