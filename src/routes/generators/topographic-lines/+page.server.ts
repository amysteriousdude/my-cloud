// hello there, tf u doing on my code????
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, apiKey } = await parent();
  return { user, apiKey };
};
