import { TrackListPage } from '../components/TrackListPage';
import { getTracks } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const tracks = await getTracks(apiBase);

  const siteName = process.env.SITE_NAME ?? 'EchoRiftSounds';
  const youtubeUrl = process.env.YOUTUBE_URL ?? '';
  const instagramUrl = process.env.INSTAGRAM_URL ?? '';
  const facebookUrl = process.env.FACEBOOK_URL ?? '';

  return (
    <TrackListPage
      tracks={tracks}
      siteName={siteName}
      youtubeUrl={youtubeUrl}
      instagramUrl={instagramUrl}
      facebookUrl={facebookUrl}
      year={new Date().getFullYear()}
    />
  );
}
