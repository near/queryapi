export const calculateBlockTimeDifference = (latestBlockHeight: number, currentBlockHeight: number): string => {
    const averageBlockTimeSeconds: number = 1.3;
    const blocksDifference: number = Math.abs(currentBlockHeight - latestBlockHeight);

    const timeDifferenceSeconds: number = blocksDifference * averageBlockTimeSeconds;

    const hours: number = Math.floor(timeDifferenceSeconds / 3600);
    const minutes: number = Math.floor((timeDifferenceSeconds % 3600) / 60);
    const seconds: number = Math.floor(timeDifferenceSeconds % 60);

    let timeDifferenceString: string = '';
    if (hours > 0) {
        timeDifferenceString += `${hours} hour${hours > 1 ? 's' : ''} `;
    }
    if (minutes > 0 || hours > 0) {
        timeDifferenceString += `${minutes} minute${minutes > 1 ? 's' : ''} `;
    }
    timeDifferenceString += `${seconds} second${seconds !== 1 ? 's' : ''}`;

    return timeDifferenceString;
}
