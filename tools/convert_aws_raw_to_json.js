const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
    console.log('Usage: node tools/convert_aws_raw_to_json.js <input-txt> <output-json>');
    process.exit(0);
}

const inputPath = path.resolve(process.cwd(), inputFile);
const outputPath = path.resolve(process.cwd(), outputFile);
const warnings = [];
const SECTION_PATTERNS = {
    prompt: /^(?:Đề|De|\?\?)\s*b(?:ài|ai|\?i)\s*:/i,
    answer: /^->\s*(?:Đáp|Dap|\?\?p)\s*(?:án|an|\?n)\s*:/i,
    explanation: /^->\s*(?:Giải|Giai|Gi\?i)\s*th(?:ích|ich|\?ch)\s*:/i,
    choicesExplanation: /^(?:Giải|Giai|Gi\?i)\s*th(?:ích|ich|\?ch)\s*(?:đáp|dap|\?\?p)\s*(?:án|an|\?n)\s*:/i,
    references: /^References?\s*:/i,
    options: /^Options?\s*:/i
};

function warn(questionNumber, message) {
    warnings.push(`Question ${questionNumber}: ${message}`);
}

function cleanLine(line) {
    return line.replace(/\r/g, '').trim();
}

function stripOptionPrefix(line) {
    return line.replace(/^\s*[A-F][.)]\s*/i, '').trim();
}

function stripSectionPrefix(line, pattern) {
    return cleanLine(line).replace(pattern, '').trim();
}

function splitBilingualText(text) {
    const cleaned = cleanLine(text);
    const parts = cleaned.split(/\s+-\s+/);
    if (parts.length >= 2) {
        return {
            en: parts[0].trim(),
            vi: parts.slice(1).join(' - ').trim()
        };
    }

    return {
        en: cleaned,
        vi: ''
    };
}

function splitBilingualBlock(lines) {
    const usefulLines = lines.map(cleanLine).filter(Boolean);
    if (usefulLines.length >= 2) {
        return {
            en: usefulLines[0],
            vi: usefulLines.slice(1).join(' ')
        };
    }

    return splitBilingualText(usefulLines[0] || '');
}

function normalizeForMatch(text) {
    return cleanLine(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/["'“”‘’.,:;()]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractUrls(lines) {
    const urls = [];
    let skipCheatSheet = false;

    lines.forEach(line => {
        if (/save time with our aws cheat sheets/i.test(line)) {
            skipCheatSheet = true;
            return;
        }

        const matches = line.match(/https?:\/\/\S+/g) || [];
        matches.forEach(url => {
            const cleaned = url.replace(/[),.]+$/g, '');
            if (!skipCheatSheet || !/cheat|sheet/i.test(cleaned)) {
                urls.push(cleaned);
            }
        });
    });

    return [...new Set(urls)];
}

function getSection(lines, startPattern, endPatterns) {
    const startIndex = lines.findIndex(line => startPattern.test(line));
    if (startIndex === -1) return [];

    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index++) {
        if (endPatterns.some(pattern => pattern.test(lines[index]))) {
            endIndex = index;
            break;
        }
    }

    return lines.slice(startIndex + 1, endIndex).map(cleanLine).filter(Boolean);
}

function getInlineAndSection(lines, startPattern, endPatterns) {
    const startIndex = lines.findIndex(line => startPattern.test(line));
    if (startIndex === -1) return [];

    const inline = stripSectionPrefix(lines[startIndex], startPattern);
    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index++) {
        if (endPatterns.some(pattern => pattern.test(lines[index]))) {
            endIndex = index;
            break;
        }
    }

    return [
        inline,
        ...lines.slice(startIndex + 1, endIndex)
    ].map(cleanLine).filter(Boolean);
}

function parseOptions(lines) {
    const optionLines = lines.filter(line => {
        const cleaned = cleanLine(line);
        if (!cleaned) return false;
        if (Object.values(SECTION_PATTERNS).some(pattern => pattern.test(cleaned))) return false;
        return /^\s*[A-F][.)]\s+/.test(cleaned) || /\s+-\s+/.test(cleaned);
    });

    return optionLines.map(line => splitBilingualText(stripOptionPrefix(line)));
}

function optionMatchesText(option, text) {
    const target = normalizeForMatch(text);
    if (!target) return false;

    const en = normalizeForMatch(option.en);
    const vi = normalizeForMatch(option.vi);
    return (
        en === target ||
        vi === target ||
        en.includes(target) ||
        target.includes(en) ||
        (vi && (vi.includes(target) || target.includes(vi)))
    );
}

function findOptionIndex(options, text) {
    const letterMatch = cleanLine(text).match(/^([A-F])(?:[.)]|\s|$)/i);
    if (letterMatch) {
        const index = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
        if (index >= 0 && index < options.length) return index;
    }

    return options.findIndex(option => optionMatchesText(option, text));
}

function parseAnswerLine(answerLines, options, questionNumber) {
    const answerText = answerLines.join(' ');
    if (!answerText) return [];

    const letterMatches = [...answerText.matchAll(/\b([A-F])\b/g)]
        .map(match => match[1].toUpperCase().charCodeAt(0) - 65)
        .filter(index => index >= 0 && index < options.length);
    if (letterMatches.length > 0) {
        return [...new Set(letterMatches)];
    }

    const chunks = answerText
        .split(/\s*(?:&|,|;|\band\b|\bvà\b)\s*/i)
        .map(cleanLine)
        .filter(Boolean);

    const indices = [];
    chunks.forEach(chunk => {
        const index = findOptionIndex(options, chunk);
        if (index === -1) {
            warn(questionNumber, `Could not match answer chunk "${chunk}" to an option.`);
            return;
        }
        indices.push(index);
    });

    return [...new Set(indices)];
}

function parseChoiceExplanations(lines, options, questionNumber) {
    const wrongExplain = Array.from({ length: options.length }, () => ({ en: '', vi: '' }));
    const correctIndices = [];
    let currentIndex = -1;

    lines.forEach(rawLine => {
        const line = cleanLine(rawLine);
        if (!line) return;

        const prefixed = line.match(/^([A-F])[.)]\s*(.*)$/i);
        let body = line;
        if (prefixed) {
            const candidateIndex = prefixed[1].toUpperCase().charCodeAt(0) - 65;
            if (candidateIndex >= 0 && candidateIndex < options.length) {
                currentIndex = candidateIndex;
                body = prefixed[2].trim();
            }
        } else {
            const matchedIndex = findOptionIndex(options, line);
            if (matchedIndex !== -1 && /(correct|incorrect|đúng|sai)/i.test(line)) {
                currentIndex = matchedIndex;
            }
        }

        if (currentIndex === -1) return;

        const isIncorrect = /\bincorrect\b|sai|không đúng|khong dung/i.test(body);
        const isCorrect = !isIncorrect && (/\bcorrect\b|đúng/i.test(body));
        if (isCorrect && !correctIndices.includes(currentIndex)) {
            correctIndices.push(currentIndex);
        }

        let cleanedBody = body
            .replace(/\bINCORRECT\b\s*[:.-]?\s*/i, '')
            .replace(/\bCORRECT\b\s*[:.-]?\s*/i, '')
            .replace(/SAI\s*[:.-]?\s*/i, '')
            .replace(/ĐÚNG\s*[:.-]?\s*/i, '')
            .trim();

        cleanedBody = cleanedBody.replace(/^["“][^"”]+["”]\s*(?:is\s*)?(?:incorrect|correct)?\.?\s*/i, '').trim();

        if (!cleanedBody && (isCorrect || isIncorrect)) {
            cleanedBody = isCorrect ? 'Correct.' : 'Incorrect.';
        }

        if (/đúng|sai/i.test(line) && !/\bcorrect\b|\bincorrect\b/i.test(line)) {
            wrongExplain[currentIndex].vi = cleanedBody;
        } else {
            wrongExplain[currentIndex].en = cleanedBody;
        }
    });

    wrongExplain.forEach((item, index) => {
        if (!item.en && !item.vi) {
            warn(questionNumber, `Missing explanation for option ${String.fromCharCode(65 + index)}.`);
            item.en = correctIndices.includes(index) ? 'Correct.' : 'Incorrect.';
            item.vi = correctIndices.includes(index) ? 'Đúng.' : 'Sai.';
        }
    });

    return {
        wrongExplain,
        correctIndices: [...new Set(correctIndices)].sort((a, b) => a - b)
    };
}

function inferTopic(question, options) {
    const haystack = normalizeForMatch([
        question.en,
        question.vi,
        ...options.flatMap(option => [option.en, option.vi])
    ].join(' '));

    const rules = [
        ['Trusted Advisor', /trusted advisor/],
        ['Well-Architected', /well architected/],
        ['Auto Scaling', /auto scaling/],
        ['CloudFront', /cloudfront/],
        ['Route 53', /route 53/],
        ['CloudWatch', /cloudwatch/],
        ['Lambda', /lambda/],
        ['Aurora', /aurora/],
        ['RDS', /\brds\b|relational database/],
        ['VPC', /\bvpc\b|virtual private cloud/],
        ['IAM', /\biam\b|identity and access management/],
        ['S3', /\bs3\b|simple storage service/],
        ['EC2', /\bec2\b/],
        ['Security', /security|bao mat|mfa|encryption|encrypt/],
        ['Billing', /billing|cost|pricing|chi phi/],
        ['Database', /database|dynamodb|documentdb|athena/],
        ['Networking', /network|latency|global accelerator|direct connect|transit gateway/]
    ];

    const match = rules.find(([, pattern]) => pattern.test(haystack));
    return match ? match[0] : 'AWS';
}

function parseQuestionBlock(block, fallbackId) {
    const lines = block.split('\n').map(cleanLine);
    const header = lines[0] || '';
    const questionNumber = Number((header.match(/Question\s+(\d+)/i) || [])[1] || fallbackId);
    const headerQuestionText = header.replace(/^Question\s+\d+\s*:\s*/i, '').trim();
    const promptLine = lines.find(line => SECTION_PATTERNS.prompt.test(line)) || '';
    const inlineVietnameseQuestion = promptLine ? stripSectionPrefix(promptLine, SECTION_PATTERNS.prompt) : '';

    const questionLines = getSection(lines, SECTION_PATTERNS.prompt, [
        SECTION_PATTERNS.options,
        /^\s*[A-F][.)]\s+/,
        SECTION_PATTERNS.answer
    ]);
    const optionSection = getSection(lines, SECTION_PATTERNS.options, [SECTION_PATTERNS.answer]);
    const optionSource = optionSection.length > 0
        ? optionSection
        : getSection(lines, SECTION_PATTERNS.prompt, [SECTION_PATTERNS.answer]);

    const answerLines = getInlineAndSection(lines, SECTION_PATTERNS.answer, [SECTION_PATTERNS.explanation, SECTION_PATTERNS.choicesExplanation, SECTION_PATTERNS.references]);
    const explainLines = getInlineAndSection(lines, SECTION_PATTERNS.explanation, [SECTION_PATTERNS.choicesExplanation, SECTION_PATTERNS.references]);
    const choiceExplainLines = getSection(lines, SECTION_PATTERNS.choicesExplanation, [SECTION_PATTERNS.references]);
    const referenceLines = getInlineAndSection(lines, SECTION_PATTERNS.references, []);

    let question = splitBilingualBlock(questionLines.filter(line => !/^\s*[A-F][.)]\s+/.test(line)));
    if (headerQuestionText) {
        question = {
            en: headerQuestionText,
            vi: inlineVietnameseQuestion || question.vi || question.en || ''
        };
    }
    const options = parseOptions(optionSource);
    if (options.length < 2) {
        warn(questionNumber, `Parsed only ${options.length} options.`);
    }

    const parsedChoiceExplanations = parseChoiceExplanations(choiceExplainLines, options, questionNumber);
    let answerIndices = parsedChoiceExplanations.correctIndices;
    if (answerIndices.length === 0) {
        answerIndices = parseAnswerLine(answerLines, options, questionNumber);
    }
    if (answerIndices.length === 0) {
        warn(questionNumber, 'Could not determine correct answer.');
    }

    const isMultiByPrompt = /\((select|choose)\s+(two|three|four|five|six|2|3|4|5|6)\.?\)/i.test(question.en);
    const answer = answerIndices.length > 1 || isMultiByPrompt ? answerIndices : answerIndices[0];
    const explain = splitBilingualBlock(explainLines);
    const refs = extractUrls(referenceLines);

    return {
        id: questionNumber,
        topic: inferTopic(question, options),
        level: 'basic',
        type: Array.isArray(answer) ? 'multiple' : 'single',
        q: question,
        options,
        answer,
        explain: {
            short: explain,
            full: explain
        },
        wrongExplain: parsedChoiceExplanations.wrongExplain,
        refs
    };
}

if (!fs.existsSync(inputPath)) {
    console.error(`Input file does not exist: ${inputFile}`);
    process.exit(1);
}

const rawText = fs.readFileSync(inputPath, 'utf8');
const blocks = rawText
    .split(/(?=^Question\s+\d+\s*:)/gim)
    .map(block => block.trim())
    .filter(Boolean);

if (blocks.length === 0) {
    console.error('No question blocks found. Expected lines like "Question 1:".');
    process.exit(1);
}

const output = {
    title: 'AWS Practice Questions',
    questions: blocks.map((block, index) => parseQuestionBlock(block, index + 1))
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(`Số câu convert được: ${output.questions.length}`);
console.log(`Số warning: ${warnings.length}`);
if (warnings.length > 0) {
    console.log('\nWarnings:');
    warnings.forEach((message, index) => console.log(`${index + 1}. ${message}`));
}
console.log(`Output: ${outputFile}`);

const validatorPath = path.resolve(__dirname, 'validate_questions.js');
if (fs.existsSync(validatorPath)) {
    console.log(`\nChạy validate: node tools/validate_questions.js ${outputFile}`);
    const result = spawnSync(process.execPath, [validatorPath, outputPath], {
        stdio: 'inherit'
    });

    if (result.status !== 0) {
        process.exit(result.status);
    }
}
