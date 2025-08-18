/**
 * Utility functions for time formatting and conversion
 */
const convertToIST = (utcTime) => {
    const date = typeof utcTime === 'string' ? new Date(utcTime) : utcTime;
    const istOffsetMinutes = 330;
    const istTime = new Date(date.getTime() + (istOffsetMinutes * 60 * 1000));
    return istTime.toISOString();
};

const getCurrentIST = () => {
    return convertToIST(new Date());
};

const formatISTDate = (date, includeTime = true) => {
    const istDate = typeof date === 'string' ? new Date(convertToIST(date)) : new Date(convertToIST(date));
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Kolkata'
    };
    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.second = '2-digit';
        options.hour12 = true;
    }
    return new Intl.DateTimeFormat('en-IN', options).format(istDate);
};

module.exports = { convertToIST, getCurrentIST, formatISTDate };