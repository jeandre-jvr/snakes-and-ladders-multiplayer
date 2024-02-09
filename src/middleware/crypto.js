import CryptoJS from "crypto-js";

export const encryptPayload = (data) => {
    return CryptoJS.AES.encrypt(JSON.stringify(data), process.env.SECRET_KEY).toString();
};

export const decryptPayload = (data) => {
    const bytes = CryptoJS.AES.decrypt(data, process.env.SECRET_KEY);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};