export const IST_OFFSET_MINUTES = 5 * 60 + 30;

export const createISTDate = (
    year: number,
    month: number, // 0-based
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
) => {
    const utcMillis =
        Date.UTC(year, month, day, hour, minute, second) -
        IST_OFFSET_MINUTES * 60 * 1000;

    return new Date(utcMillis);
};