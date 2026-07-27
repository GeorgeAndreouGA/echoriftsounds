import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Category } from '@echorift/shared';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  // Public: the track list needs the category names to label its tabs.
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'List categories in display order' })
  @ApiOkResponse({ description: 'Array of { id, name }' })
  async list(): Promise<Category[]> {
    return this.categories.list();
  }
}
