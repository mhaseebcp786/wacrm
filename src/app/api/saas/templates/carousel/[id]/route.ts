import { editCarouselTemplate } from '@/saas/lib/templates/carousel-template-service';

/** Edit + resubmit a carousel template. See carousel-template-service.ts. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return editCarouselTemplate(request, id);
}
