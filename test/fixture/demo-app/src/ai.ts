const key = import.meta.env.VITE_OPENAI_API_KEY;
export const ask = (q: string) => fetch("https://api.openai.com/v1/chat/completions", { headers: { Authorization: `Bearer ${key}` }, method: "POST", body: JSON.stringify({ q }) });
