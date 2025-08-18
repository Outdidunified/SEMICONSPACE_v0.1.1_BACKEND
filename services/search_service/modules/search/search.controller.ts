import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query('q') q: string) {
    const query = q?.trim();
    if (!query) {
      throw new HttpException('Empty query not allowed', HttpStatus.BAD_REQUEST);
    }

    return this.searchService.search(query);
  }
}
