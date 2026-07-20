// Bundled editorial artwork per topic (generated brand art).
// Used wherever an article has no image — cards, reader, hero fallbacks.
export const topicArt: Record<string, any> = {
  'Tech & AI': require('../../assets/images/topics/tech-ai.webp'),
  Business: require('../../assets/images/topics/business.webp'),
  World: require('../../assets/images/topics/world.webp'),
  Politics: require('../../assets/images/topics/politics.webp'),
  Science: require('../../assets/images/topics/science.webp'),
  India: require('../../assets/images/topics/india.webp'),
  Sports: require('../../assets/images/topics/sports.webp'),
  Automobile: require('../../assets/images/topics/automobile.webp'),
  'Real Estate': require('../../assets/images/topics/real-estate.webp'),
  'Health & Wellness': require('../../assets/images/topics/health.webp'),
  'Markets & Startups': require('../../assets/images/topics/markets.webp'),
  Explained: require('../../assets/images/topics/explained.webp'),
  'Corporate Case': require('../../assets/images/topics/corporate.webp'),
};

export function artFor(topic: string | null | undefined): any | null {
  return (topic && topicArt[topic]) ?? topicArt.Explained ?? null;
}
