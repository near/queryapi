//Dummy component
import { useState } from 'react';

type Schema = {
  type: string;
  properties?: Record<string, { type: string }>;
  required?: string[];
};

type Method = {
  method_name: string;
  schema: Schema;
};

type Event = {
  event_name: string;
  schema: Schema;
};

const GenerateCode = () => {
  const [contractFilter, setContractFilter] = useState<string>('');
  const [selectedMethods, setSelectedMethods] = useState<Method[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<Event[]>([]);
  const [generatedCode, setGeneratedCode] = useState<{ jsCode: string; sqlCode: string }>({ jsCode: '', sqlCode: '' });

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

  const handleMethodChange = (index: number, field: keyof Method, value: string) => {
    const updatedMethods = [...selectedMethods];
    if (field === 'schema') {
      try {
        updatedMethods[index] = { ...updatedMethods[index], schema: JSON.parse(value) };
      } catch (e) {
        console.error('Invalid JSON format');
      }
    } else {
      updatedMethods[index] = { ...updatedMethods[index], [field]: value };
    }
    setSelectedMethods(updatedMethods);
  };

  const handleEventChange = (index: number, field: keyof Event, value: string) => {
    const updatedEvents = [...selectedEvents];
    if (field === 'schema') {
      try {
        updatedEvents[index] = { ...updatedEvents[index], schema: JSON.parse(value) };
      } catch (e) {
        console.error('Invalid JSON format');
      }
    } else {
      updatedEvents[index] = { ...updatedEvents[index], [field]: value };
    }
    setSelectedEvents(updatedEvents);
  };

  const addMethod = () => {
    setSelectedMethods([...selectedMethods, { method_name: '', schema: { type: 'object' } }]);
  };

  const addEvent = () => {
    setSelectedEvents([...selectedEvents, { event_name: '', schema: { type: 'object' } }]);
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
          <h2 className="text-xl font-semibold mb-2">Selected Methods</h2>
          {selectedMethods.map((method, index) => (
            <div key={index} className="mb-4">
              <input
                type="text"
                placeholder="Method Name"
                value={method.method_name}
                onChange={(e) => handleMethodChange(index, 'method_name', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md mb-2"
              />
              <textarea
                placeholder="Schema (JSON format)"
                value={JSON.stringify(method.schema, null, 2)}
                onChange={(e) => handleMethodChange(index, 'schema', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md"
              />
            </div>
          ))}
          <button
            onClick={addMethod}
            className="w-full bg-green-500 text-white py-2 rounded-md hover:bg-green-600 transition duration-200"
          >
            Add Method
          </button>
        </div>

        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Selected Events</h2>
          {selectedEvents.map((event, index) => (
            <div key={index} className="mb-4">
              <input
                type="text"
                placeholder="Event Name"
                value={event.event_name}
                onChange={(e) => handleEventChange(index, 'event_name', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md mb-2"
              />
              <textarea
                placeholder="Schema (JSON format)"
                value={JSON.stringify(event.schema, null, 2)}
                onChange={(e) => handleEventChange(index, 'schema', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md"
              />
            </div>
          ))}
          <button
            onClick={addEvent}
            className="w-full bg-green-500 text-white py-2 rounded-md hover:bg-green-600 transition duration-200"
          >
            Add Event
          </button>
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
