const fs = require('fs');
const path = require('path');

const targetFile = process.argv[2];

if (!targetFile) {
    console.log('Usage: node tools/validate_questions.js <path-to-json>');
    process.exit(0);
}

const filePath = path.resolve(process.cwd(), targetFile);
const errors = [];
const warnings = [];

function addError(scope, message) {
    errors.push({ scope, message });
}

function addWarning(scope, message) {
    warnings.push({ scope, message });
}

function getQuestionScope(question, index) {
    return `Question ${index + 1}${question && question.id !== undefined ? ` (id: ${question.id})` : ''}`;
}

function isLocalizedText(value) {
    return value && typeof value === 'object' && !Array.isArray(value) && ('en' in value || 'vi' in value);
}

function isValidTextValue(value) {
    if (typeof value === 'string') return value.trim().length > 0;
    if (!isLocalizedText(value)) return false;
    return (
        (typeof value.en === 'string' && value.en.trim().length > 0) ||
        (typeof value.vi === 'string' && value.vi.trim().length > 0)
    );
}

function validateExplainText(value, scope, fieldName) {
    if (value === undefined) return;

    if (typeof value === 'string') {
        if (!value.trim()) addWarning(scope, `${fieldName} is an empty string.`);
        return;
    }

    if (isLocalizedText(value)) {
        if (value.en !== undefined && typeof value.en !== 'string') {
            addError(scope, `${fieldName}.en must be a string.`);
        }
        if (value.vi !== undefined && typeof value.vi !== 'string') {
            addError(scope, `${fieldName}.vi must be a string.`);
        }
        if (!isValidTextValue(value)) {
            addWarning(scope, `${fieldName} has no non-empty en/vi content.`);
        }
        return;
    }

    addError(scope, `${fieldName} must be a string or object { en, vi }.`);
}

function validateAnswer(answer, optionCount, type, scope) {
    if (typeof answer === 'number') {
        if (!Number.isInteger(answer)) {
            addError(scope, 'answer must be an integer index.');
        } else if (answer < 0 || answer >= optionCount) {
            addError(scope, `answer index ${answer} is out of range 0-${optionCount - 1}.`);
        }

        if (type === 'multiple') {
            addError(scope, 'type is "multiple" but answer is not an array.');
        }
        return;
    }

    if (Array.isArray(answer)) {
        if (answer.length === 0) {
            addError(scope, 'answer array must not be empty.');
        }

        const seen = new Set();
        answer.forEach((index, itemIndex) => {
            if (typeof index !== 'number' || !Number.isInteger(index)) {
                addError(scope, `answer[${itemIndex}] must be an integer index.`);
                return;
            }
            if (seen.has(index)) {
                addError(scope, `answer index ${index} is duplicated.`);
            }
            seen.add(index);
            if (index < 0 || index >= optionCount) {
                addError(scope, `answer index ${index} is out of range 0-${optionCount - 1}.`);
            }
        });

        if (type === 'single') {
            addWarning(scope, 'type is "single" but answer is an array.');
        }
        return;
    }

    addError(scope, 'answer must be a number or an array of numbers.');
}

function printReport(questionCount) {
    console.log(`File: ${targetFile}`);
    console.log(`Tổng số câu: ${questionCount}`);
    console.log(`Số lỗi: ${errors.length}`);
    console.log(`Số warning: ${warnings.length}`);

    if (errors.length > 0) {
        console.log('\nErrors:');
        errors.forEach((item, index) => {
            console.log(`${index + 1}. [${item.scope}] ${item.message}`);
        });
    }

    if (warnings.length > 0) {
        console.log('\nWarnings:');
        warnings.forEach((item, index) => {
            console.log(`${index + 1}. [${item.scope}] ${item.message}`);
        });
    }

    if (errors.length === 0) {
        console.log('\n✅ JSON hợp lệ, có thể dùng cho web.');
    }
}

if (!fs.existsSync(filePath)) {
    addError('File', `File does not exist: ${targetFile}`);
    printReport(0);
    process.exit(1);
}

let data;
try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (error) {
    addError('File', `JSON parse error: ${error.message}`);
    printReport(0);
    process.exit(1);
}

if (!data.title) {
    addError('Root', 'Missing title.');
}

if (!Array.isArray(data.questions)) {
    addError('Root', 'Missing questions or questions is not an array.');
    printReport(0);
    process.exit(1);
}

if (data.questions.length === 0) {
    addError('Root', 'questions must not be empty.');
}

data.questions.forEach((question, index) => {
    const scope = getQuestionScope(question, index);

    if (!question || typeof question !== 'object' || Array.isArray(question)) {
        addError(scope, 'Question must be an object.');
        return;
    }

    if (question.id === undefined || question.id === null || question.id === '') {
        addError(scope, 'Missing id.');
    }

    if (question.q === undefined) {
        addError(scope, 'Missing q.');
    } else if (typeof question.q === 'string') {
        if (!question.q.trim()) addError(scope, 'q must not be empty.');
        addWarning(scope, 'q.en is missing because q is a plain string.');
        addWarning(scope, 'q.vi is missing because q is a plain string.');
    } else if (isLocalizedText(question.q)) {
        if (!question.q.en) addWarning(scope, 'q.en is missing.');
        if (!question.q.vi) addWarning(scope, 'q.vi is missing.');
        if (question.q.en !== undefined && typeof question.q.en !== 'string') {
            addError(scope, 'q.en must be a string.');
        }
        if (question.q.vi !== undefined && typeof question.q.vi !== 'string') {
            addError(scope, 'q.vi must be a string.');
        }
    } else {
        addError(scope, 'q must be a string or object { en, vi }.');
    }

    const options = question.options || question.o;
    if (options === undefined) {
        addError(scope, 'Missing options or o.');
    } else if (!Array.isArray(options)) {
        addError(scope, 'options/o must be an array.');
    } else {
        if (options.length < 2) {
            addError(scope, 'Each question must have at least 2 options.');
        }

        options.forEach((option, optionIndex) => {
            if (!isValidTextValue(option)) {
                addError(scope, `Option ${optionIndex} must be a non-empty string or object with en/vi content.`);
            }
        });
    }

    const answer = question.answer !== undefined ? question.answer : question.a;
    if (answer === undefined) {
        addError(scope, 'Missing answer or a.');
    } else if (Array.isArray(options)) {
        validateAnswer(answer, options.length, question.type, scope);
    }

    if (question.type !== undefined && !['single', 'multiple'].includes(question.type)) {
        addWarning(scope, `Unknown type "${question.type}". Expected "single" or "multiple".`);
    }

    ['wrongExplain', 'choicesExplain'].forEach(fieldName => {
        if (question[fieldName] !== undefined) {
            if (!Array.isArray(question[fieldName])) {
                addError(scope, `${fieldName} must be an array.`);
            } else if (Array.isArray(options) && question[fieldName].length !== options.length) {
                addError(scope, `${fieldName} length (${question[fieldName].length}) must equal options length (${options.length}).`);
            }
        }
    });

    if (question.refs !== undefined && !Array.isArray(question.refs)) {
        addError(scope, 'refs must be an array.');
    }

    if (question.explain && typeof question.explain === 'object' && !Array.isArray(question.explain) && !isLocalizedText(question.explain)) {
        validateExplainText(question.explain.short, scope, 'explain.short');
        validateExplainText(question.explain.full, scope, 'explain.full');
    } else if (question.explain !== undefined) {
        validateExplainText(question.explain, scope, 'explain');
    }

    validateExplainText(question.fullExplain, scope, 'fullExplain');
});

printReport(data.questions.length);

if (errors.length > 0) {
    process.exit(1);
}
