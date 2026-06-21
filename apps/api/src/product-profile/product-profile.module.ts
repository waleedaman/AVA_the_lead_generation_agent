import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductProfileController } from './product-profile.controller';
import { ProductProfileService } from './product-profile.service';
import {
  ProductProfile,
  ProductProfileSchema,
} from './schemas/product-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductProfile.name, schema: ProductProfileSchema },
    ]),
  ],
  controllers: [ProductProfileController],
  providers: [ProductProfileService],
})
export class ProductProfileModule {}
