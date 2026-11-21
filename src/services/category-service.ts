import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type { CategoryRepository } from '../repositories/category-repository.ts';
import type { Category, CategoryFilter } from '../types/category.ts';

const MAX_CATEGORY_NAME_LENGTH = 80;

export class CategoryService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  createCategory(name: string): Category {
    const normalizedName = name.trim();
    const nameLength = [...normalizedName].length;

    if (nameLength === 0) {
      throw new AppError(AppErrorCode.InvalidCategoryName, 'Category name cannot be empty.', {
        name,
      });
    }

    if (nameLength > MAX_CATEGORY_NAME_LENGTH) {
      throw new AppError(
        AppErrorCode.InvalidCategoryName,
        `Category name cannot exceed ${MAX_CATEGORY_NAME_LENGTH} characters.`,
        { name: normalizedName, maxLength: MAX_CATEGORY_NAME_LENGTH, actualLength: nameLength },
      );
    }

    return this.categoryRepository.create(normalizedName, Date.now());
  }

  toggleCategoryArchived(id: number): Category {
    const category = this.categoryRepository.toggleArchived(id);

    if (category === null) {
      throw new AppError(AppErrorCode.CategoryNotFound, `Category ${id} does not exist.`, {
        categoryId: id,
      });
    }

    return category;
  }

  listCategories(filter: CategoryFilter = 'all'): Category[] {
    return this.categoryRepository.findAll(filter);
  }
}
