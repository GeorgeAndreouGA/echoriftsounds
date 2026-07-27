import { TrackListPage } from '../components/TrackListPage';
import { getCategories, getTracks } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const [tracks, categories] = await Promise.all([getTracks(apiBase), getCategories(apiBase)]);

  const siteName = process.env.SITE_NAME ?? 'EchoRiftSounds';
  const youtubeUrl = process.env.YOUTUBE_URL ?? '';
  const instagramUrl = process.env.INSTAGRAM_URL ?? '';
  const facebookUrl = process.env.FACEBOOK_URL ?? '';

  return (
    <TrackListPage
      tracks={tracks}
      categories={categories}
      siteName={siteName}
      youtubeUrl={youtubeUrl}
      instagramUrl={instagramUrl}
      facebookUrl={facebookUrl}
      year={new Date().getFullYear()}
    />
  );
}
