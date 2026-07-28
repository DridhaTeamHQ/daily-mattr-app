/* Bundled editorial artwork per category (generated brand art).
 * Used wherever an article has no image — cards, reader, hero fallbacks.
 *
 * One image per category and nothing else. Five of these used to belong to
 * pipeline-only topics — Automobile, Real Estate, Markets & Startups, Corporate
 * Case, Health & Wellness — that no editor could file a story under. Their
 * files are still in assets/, unreferenced, for whenever the desk adds those
 * categories; deleting them would mean redrawing them to match the set. */
export const topicArt: Record<string, any> = {
  India: require('../../assets/images/topics/india.webp'),
  World: require('../../assets/images/topics/world.webp'),
  Politics: require('../../assets/images/topics/politics.webp'),
  Business: require('../../assets/images/topics/business.webp'),
  Technology: require('../../assets/images/topics/tech-ai.webp'),
  Science: require('../../assets/images/topics/science.webp'),
  Sports: require('../../assets/images/topics/sports.webp'),
  Entertainment: require('../../assets/images/topics/entertainment.webp'),
  // An unfiled story is not "Explained" — it is just news, and looks like it.
  News: require('../../assets/images/topics/explained.webp'),
};

export function artFor(topic: string | null | undefined): any | null {
  return (topic && topicArt[topic]) ?? topicArt.News ?? null;
}
