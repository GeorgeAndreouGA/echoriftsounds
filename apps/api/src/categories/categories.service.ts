import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Category, CategoryId, isValidCategoryName, slugify } from '@echorift/shared';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly storage: StorageService) {}

  /** Tab order on the public site — creation order, so the admin controls it implicitly. */
  list(): Promise<Category[]> {
    return this.storage.categories.read();
  }

  /**
   * Throws unless every id refers to an existing category. `null` (uncategorized)
   * is always valid. Callers use this to reject a publish into a category that
   * was deleted between the admin panel rendering and the form being submitted.
   */
  async assertExists(id: CategoryId | null | undefined): Promise<void> {
    if (id === null || id === undefined) return;
    const categories = await this.storage.categories.read();
    if (!categories.some((c) => c.id === id)) {
      throw new BadRequestException(`Unknown category: ${id}`);
    }
  }

  async create(name: string): Promise<Category> {
    if (!isValidCategoryName(name)) {
      throw new BadRequestException('Invalid category name');
    }
    const trimmed = name.trim();
    const id = slugify(trimmed);
    if (!id) {
      throw new BadRequestException('Category name must contain at least one letter or number');
    }

    let created: Category | undefined;
    await this.storage.categories.update((current) => {
      if (current.some((c) => c.id === id)) {
        throw new BadRequestException(`Category already exists: ${trimmed}`);
      }
      created = { id, name: trimmed };
      return [...current, created];
    });

    this.logger.log(`category created: ${id}`);
    return created!;
  }

  /** Renames in place. The id is what tracks reference, so it deliberately does not change. */
  async rename(id: CategoryId, name: string): Promise<Category> {
    if (!isValidCategoryName(name)) {
      throw new BadRequestException('Invalid category name');
    }
    const trimmed = name.trim();

    let renamed: Category | undefined;
    await this.storage.categories.update((current) => {
      const existing = current.find((c) => c.id === id);
      if (!existing) {
        throw new NotFoundException(`Unknown category: ${id}`);
      }
      renamed = { ...existing, name: trimmed };
      return current.map((c) => (c.id === id ? renamed! : c));
    });

    this.logger.log(`category renamed: ${id} -> ${trimmed}`);
    return renamed!;
  }

  /**
   * Deletes categories, but only ones with no tracks in them. A category that
   * still has published or scheduled tracks is refused — the admin must
   * reassign or unpublish those tracks first. This prevents a delete from
   * silently orphaning mixes into an uncategorized state.
   */
  async remove(ids: CategoryId[]): Promise<void> {
    if (ids.length === 0) return;
    const doomed = new Set(ids);

    const [categories, published, scheduled] = await Promise.all([
      this.storage.categories.read(),
      this.storage.published.read(),
      this.storage.scheduled.read(),
    ]);

    // Count references per doomed id across both stores so the error can name
    // exactly what's blocking the delete.
    const counts = new Map<CategoryId, number>();
    for (const t of [...published, ...scheduled]) {
      if (t.category && doomed.has(t.category)) {
        counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
      }
    }
    if (counts.size > 0) {
      const nameOf = (id: CategoryId) => categories.find((c) => c.id === id)?.name ?? id;
      const blocked = Array.from(counts.entries())
        .map(([id, n]) => `"${nameOf(id)}" (${n} track${n === 1 ? '' : 's'})`)
        .join(', ');
      throw new BadRequestException(
        `Cannot delete ${blocked} — reassign or unpublish the tracks first.`,
      );
    }

    await this.storage.categories.update((current) => current.filter((c) => !doomed.has(c.id)));

    this.logger.log(`categories removed: ${ids.join(', ')}`);
  }
}
