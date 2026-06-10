export interface KeywordResult {
  keywords: string[];
  questions: string[];
  related: string[];
}

export function suggestKeywords(topic: string): KeywordResult {
  const base = topic.toLowerCase().trim();

  const modifiers = ['best', 'top', 'affordable', 'cheap', 'free', 'professional', 'online', 'ultimate', 'premium'];
  const keywords = modifiers.map(m => `${m} ${base}`);

  const questions = [
    `what is ${base}`,
    `how to ${base.includes(' ') ? '' : 'use '}${base}`,
    `${base} for beginners`,
    `${base} vs`,
    `why ${base} is important`,
    `how to improve ${base}`,
  ];

  const related = [
    `${base} guide`,
    `${base} tutorial`,
    `${base} tips`,
    `${base} examples`,
    `${base} best practices`,
    `${base} tools`,
    `${base} checklist`,
    `${base} strategy`,
    `${base} for business`,
  ];

  return { keywords, questions, related };
}
