# 🤝 Hướng dẫn đóng góp – SmartLibrary

## Git Flow

### Nhánh chính

| Nhánh | Mục đích | Protected |
|---|---|---|
| `main` | Production – chỉ merge từ `release/*` hoặc `hotfix/*` | ✅ |
| `develop` | Integration – merge feature vào đây | ✅ |

### Nhánh phụ

| Loại | Quy tắc đặt tên | Ví dụ |
|---|---|---|
| Feature | `feature/<module>/<mô-tả>` | `feature/books/crud-api` |
| Hotfix | `hotfix/<mô-tả>` | `hotfix/fix-login-crash` |
| Release | `release/v<version>` | `release/v1.0.0` |

### Quy trình làm việc

```
1. Checkout từ develop:        git checkout -b feature/books/crud-api develop
2. Code + commit (conventional commits)
3. Push + tạo Pull Request vào develop
4. Code review (ít nhất 1 approve)
5. Merge (squash merge)
6. Xoá nhánh feature
```

## Conventional Commits

Mọi commit message phải tuân thủ format:

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

### Type

| Type | Mô tả |
|---|---|
| `feat` | Tính năng mới |
| `fix` | Sửa bug |
| `docs` | Thay đổi tài liệu |
| `style` | Format code (không ảnh hưởng logic) |
| `refactor` | Refactor code |
| `test` | Thêm/sửa test |
| `chore` | Build, config, CI/CD |
| `perf` | Cải thiện performance |

### Scope (phạm vi)

Dùng tên module: `auth`, `books`, `borrowing`, `fines`, `ai`, `web`, `mobile`, `api`, `db`, `ci`, `docs`...

### Ví dụ

```
feat(books): add CRUD endpoints for book management
fix(auth): resolve token refresh loop on mobile
docs(api): update Swagger descriptions for borrow endpoints
chore(ci): add path filter for web workflow
test(books): add unit tests for BookService
```

## Quy tắc đặt tên

### C# (.NET)

```csharp
// PascalCase cho class, method, property, enum
public class BookService { }
public async Task<Result<BookDto>> GetByIdAsync(Guid id) { }

// camelCase cho biến local, parameter
var bookCount = await repository.CountAsync();

// Interface bắt đầu bằng "I"
public interface IBookRepository { }

// Private field bắt đầu bằng "_"
private readonly IBookRepository _bookRepository;
```

### TypeScript / React

```typescript
// camelCase cho biến, hàm
const fetchBooks = async () => { };
const isLoading = true;

// PascalCase cho component, type, interface
const BookCard: React.FC<BookCardProps> = () => { };
interface BookDto { }

// kebab-case cho file
// book-card.tsx, use-books.ts, books-api.ts

// UPPER_SNAKE_CASE cho hằng số
const MAX_PAGE_SIZE = 50;
```

### Database

```sql
-- snake_case cho bảng, cột
CREATE TABLE book_copies (
    id UUID PRIMARY KEY,
    book_id UUID REFERENCES books(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Checklist Pull Request

Trước khi tạo PR, hãy đảm bảo:

- [ ] Code đã build thành công (`dotnet build` / `npm run build`)
- [ ] Đã chạy lint (`npm run lint`) và không có lỗi
- [ ] Đã viết/cập nhật unit test (nếu liên quan)
- [ ] Commit message đúng format Conventional Commits
- [ ] Không commit file `.env`, secrets, hoặc file không cần thiết
- [ ] Đã cập nhật tài liệu (nếu thay đổi API hoặc kiến trúc)
- [ ] PR title đúng format: `<type>(<scope>): <description>`
- [ ] Đã self-review code trước khi request review

## Quy tắc Code Review

1. **Tôn trọng** – comment mang tính xây dựng
2. **Cụ thể** – chỉ rõ dòng code, đề xuất cách sửa
3. **Nhanh** – review trong vòng 24h
4. **Approve** khi code đạt yêu cầu, **Request Changes** khi cần sửa

## Cấu trúc thư mục theo module

Khi tạo module mới, tuân theo cấu trúc vertical slice:

### Backend

```
Features/<ModuleName>/
├── DTOs/
│   ├── <Module>Dto.cs
│   ├── Create<Module>Request.cs
│   └── Update<Module>Request.cs
├── Validators/
│   ├── Create<Module>Validator.cs
│   └── Update<Module>Validator.cs
├── I<Module>Repository.cs
└── <Module>Service.cs
```

### Web / Mobile

```
features/<module-name>/
├── components/
├── hooks/
├── api/
├── types/
├── pages/       (web only)
└── index.ts
```
