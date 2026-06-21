import { Body, Controller, Get, Put } from '@nestjs/common';
import { ProductProfileService } from './product-profile.service';
import { UpdateProductProfileDto } from './dto/update-product-profile.dto';

@Controller('product-profile')
export class ProductProfileController {
  constructor(private readonly productProfileService: ProductProfileService) {}

  @Get()
  findDefault() {
    return this.productProfileService.findDefault();
  }

  @Put()
  updateDefault(@Body() updateProductProfileDto: UpdateProductProfileDto) {
    return this.productProfileService.updateDefault(updateProductProfileDto);
  }
}
