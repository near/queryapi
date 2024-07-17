//Dummy Component to generate code
import { useState } from 'react';

const GenerateCode = () => {
    const [contractFilter, setContractFilter] = useState('');
    const [selectedMethods, setSelectedMethods] = useState([]);
    const [selectedEvents, setSelectedEvents] = useState([]);
    const [generatedCode, setGeneratedCode] = useState({ jsCode: '', sqlCode: '' });

    const handleGenerateCode = async () => {
        const response = await fetch('/api/generateCode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contractFilter, selectedMethods, selectedEvents }),
        });
        const data = await response.json();
        setGeneratedCode(data);
    };

    return (
        <div className="min-h-screen bg-gray-100 p-6">
            <div className="max-w-3xl mx-auto bg-white p-8 shadow-lg rounded-lg">
                <h1 className="text-3xl font-bold mb-6">Generate Code</h1>
                <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Contract Filter"
                        value={contractFilter}
                        onChange={(e) => setContractFilter(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-md"
                    />
                </div>
                <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Selected Methods (comma separated)"
                        value={selectedMethods}
                        onChange={(e) => setSelectedMethods(e.target.value.split(','))}
                        className="w-full p-3 border border-gray-300 rounded-md"
                    />
                </div>
                <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Selected Events (comma separated)"
                        value={selectedEvents}
                        onChange={(e) => setSelectedEvents(e.target.value.split(','))}
                        className="w-full p-3 border border-gray-300 rounded-md"
                    />
                </div>
                <button
                    onClick={handleGenerateCode}
                    className="w-full bg-blue-500 text-white py-3 rounded-md hover:bg-blue-600 transition duration-200"
                >
                    Generate Code
                </button>
                <div className="mt-6">
                    <h2 className="text-2xl font-semibold mb-4">Generated JavaScript Code</h2>
                    <pre className="bg-gray-200 p-4 rounded-md whitespace-pre-wrap">{generatedCode.jsCode}</pre>
                </div>
                <div className="mt-6">
                    <h2 className="text-2xl font-semibold mb-4">Generated SQL Code</h2>
                    <pre className="bg-gray-200 p-4 rounded-md whitespace-pre-wrap">{generatedCode.sqlCode}</pre>
                </div>
            </div>
        </div>
    );
};

export default GenerateCode;
