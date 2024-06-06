import { DURATION_MAP } from '../constants/DurationMap';

export const calculateTimestamp = (selectedOption: string): string => {
    const currentTime: number = Date.now();
    const duration: number | undefined = DURATION_MAP[selectedOption];
    if (duration !== undefined) {
        return new Date(currentTime - duration).toISOString();
    } else {
        console.log('invalid option');
        return "";
    }
};
