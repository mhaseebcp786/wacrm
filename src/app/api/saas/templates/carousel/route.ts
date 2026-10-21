import { submitCarouselTemplate } from '@/saas/lib/templates/carousel-template-service';

/** Create + submit a carousel template. See carousel-template-service.ts. */
export async function POST(request: Request) {
  return submitCarouselTemplate(request);
}
