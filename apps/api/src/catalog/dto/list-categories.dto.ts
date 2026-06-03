import { IsBooleanString, IsOptional } from 'class-validator';

/** Query params for GET /categories. `tree=true` returns a nested tree. */
export class ListCategoriesDto {
  @IsOptional()
  @IsBooleanString()
  tree?: string;
}
