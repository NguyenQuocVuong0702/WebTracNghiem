# Data Workflow

## Folders

- `input/`: raw AWS question text files.
- `data/`: JSON question files used by the web quiz.
- `tools/`: Node.js utilities for converting, validating, and merging question data.

## Convert One Batch

```bash
node tools/convert_aws_raw_to_json.js input/aws_raw_001_025.txt data/aws_questions_part_001.json
```

Or run the test conversion:

```bash
npm run convert:test
```

## Validate One Batch

```bash
node tools/validate_questions.js data/aws_questions_part_001.json
```

Or validate the test file:

```bash
npm run validate:test
```

## Use Batches As Separate Exams

```bash
node tools/validate_questions.js data/aws_de_01.json
node tools/validate_questions.js data/aws_de_02.json
```

Each 25-question batch is loaded as a separate quiz card. Do not merge batches into one total file for the dashboard.

```js
const QUESTION_DATA_FILES = [
    './data/aws_de_01.json',
    './data/aws_de_02.json'
];
```

Then run the app with Live Server.
