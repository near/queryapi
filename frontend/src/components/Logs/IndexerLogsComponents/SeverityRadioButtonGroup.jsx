function SeverityRadioButtonGroup({ selectedSeverity, onSeverityChange }) {
    const severityOptions = ['INFO', 'DEBUG', 'WARNING', 'ERROR'];

    const handleOptionChange = (event) => {
        onSeverityChange(event.target.value);
    };

    return (
        <div>
            {severityOptions.map((option) => (
                <label key={option}>
                    <input
                        type="radio"
                        value={option}
                        checked={selectedSeverity === option}
                        onChange={handleOptionChange}
                    />
                    {option}
                </label>
            ))}
            <label>
                <input
                    type="radio"
                    value=''
                    checked={selectedSeverity === ''}
                    onChange={handleOptionChange}
                />
                NONE (ALL)
            </label>
        </div>
    );
}

export default SeverityRadioButtonGroup;