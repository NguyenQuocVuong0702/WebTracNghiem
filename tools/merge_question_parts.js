const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const outputFile = process.argv[2];
const inputFiles = process.argv.slice(3);

if (!outputFile || inputFiles.length === 0) {
    console.log('Usage: node tools/merge_question_parts.js <output-json> <input-json-1> <input-json-2> ...');
    process.exit(0);
}

const outputPath = path.resolve(process.cwd(), outputFile);
const errors = [];
const warnings = [];
const mergedQuestions = [];
const seenIds = new Map();

function addError(message) {
    errors.push(message);
}

function addWarning(message) {
    warnings.push(message);
}

function readJsonFile(file) {
    const filePath = path.resolve(process.cwd(), file);

    if (!fs.existsSync(filePath)) {
        addError(`Input file does not exist: ${file}`);
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        addError(`JSON parse error in ${file}: ${error.message}`);
        return null;
    }
}

inputFiles.forEach(file => {
    const data = readJsonFile(file);
    if (!data) return;

    if (!Array.isArray(data.questions)) {
        addError(`${file}: missing questions array.`);
        return;
    }

    data.questions.forEach((question, index) => {
        if (!question || typeof question !== 'object') {
            addError(`${file}: question ${index + 1} is not an object.`);
            return;
        }

        if (question.id === undefined || question.id === null || question.id === '') {
            addError(`${file}: question ${index + 1} is missing id.`);
            return;
        }

        const idKey = String(question.id);
        if (seenIds.has(idKey)) {
            addError(`Duplicate id "${question.id}" found in ${file}; first seen in ${seenIds.get(idKey)}.`);
            return;
        }

        seenIds.set(idKey, file);
        mergedQuestions.push(question);
    });
});

if (warnings.length > 0) {
    console.log('Warnings:');
    warnings.forEach((message, index) => console.log(`${index + 1}. ${message}`));
    console.log('');
}

if (errors.length > 0) {
    console.error('Errors:');
    errors.forEach((message, index) => console.error(`${index + 1}. ${message}`));
    process.exit(1);
}

const output = {
    title: 'AWS Practice Questions',
    questions: mergedQuestions
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const ids = mergedQuestions.map(question => question.id);
console.log(`Số file input: ${inputFiles.length}`);
console.log(`Tổng số câu đã gộp: ${mergedQuestions.length}`);
console.log(`ID đầu/cuối: ${ids.length ? `${ids[0]} / ${ids[ids.length - 1]}` : 'N/A'}`);
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
