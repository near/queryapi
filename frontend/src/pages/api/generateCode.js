import { defaultCode, defaultSchema, } from '../../utils/formatters';

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { contractFilter, selectedMethods, selectedEvents } = req.body;

    if (!contractFilter || !selectedMethods || !selectedEvents) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!Array.isArray(selectedMethods) || !Array.isArray(selectedEvents)) {
        return res.status(400).json({ error: 'selectedMethods and selectedEvents must be arrays' });
    }

    const jsCode = generateDummyJSCode(contractFilter, selectedMethods, selectedEvents);
    const sqlCode = generateDummySQLCode(contractFilter, selectedMethods, selectedEvents);

    res.status(200).json({ jsCode, sqlCode });
}

function generateDummyJSCode(contractFilter, selectedMethods, selectedEvents) {
    let jsCode = `// JavaScript Code\n\n`;
    jsCode += `-- Contract Filter: ${contractFilter}\n\n`;
    jsCode += `-- Selected Methods: ${selectedMethods}\n\n`;
    jsCode += `-- Selected Events: ${selectedEvents}\n\n`;

    jsCode += defaultCode;

    selectedMethods.forEach(method => {
        jsCode += `function ${method}() {\n`;
        jsCode += `  console.log('Executing ${method}');\n`;
        jsCode += `}\n\n`;
    });

    selectedEvents.forEach(event => {
        jsCode += `function handle${event}() {\n`;
        jsCode += `  console.log('Handling event ${event}');\n`;
        jsCode += `}\n\n`;
    });

    return jsCode;
}

function generateDummySQLCode(contractFilter, selectedMethods, selectedEvents) {
    let sqlCode = `-- SQL Code\n\n`;
    sqlCode += `-- Contract Filter: ${contractFilter}\n\n`;
    sqlCode += `-- Selected Methods: ${selectedMethods}\n\n`;
    sqlCode += `-- Selected Events: ${selectedEvents}\n\n`;

    sqlCode += defaultSchema;

    selectedMethods.forEach(method => {
        sqlCode += `-- Method: ${method}\n`;
        sqlCode += `INSERT INTO methods (name) VALUES ('${method}');\n\n`;
    });

    selectedEvents.forEach(event => {
        sqlCode += `-- Event: ${event}\n`;
        sqlCode += `INSERT INTO events (name) VALUES ('${event}');\n\n`;
    });

    return sqlCode;
}
