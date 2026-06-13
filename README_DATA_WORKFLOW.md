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

## Merge Many Batches

```bash
node tools/merge_question_parts.js data/aws_questions.json data/aws_questions_part_001.json data/aws_questions_part_002.json
```

The merge tool runs validation automatically after writing the output file.

## Use The Merged File In The Web App

After creating `data/aws_questions.json`, update the data file path in `script.js`:

```js
const QUESTION_DATA_FILES = ['./data/aws_questions.json'];
```

Then run the app with Live Server.
