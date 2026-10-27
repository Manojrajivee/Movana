import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';

describe('PasswordService (Unit Tests)', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should hash a password with bcrypt and produce a valid hash', async () => {
    const plain = 'StrongP@ssw0rd123';
    const hash = await service.hashPassword(plain);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(plain);
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('should verify matching plain password against hash', async () => {
    const plain = 'AnotherV@lidPass!1';
    const hash = await service.hashPassword(plain);

    const matches = await service.comparePassword(plain, hash);
    expect(matches).toBe(true);
  });

  it('should reject non-matching password', async () => {
    const plain = 'ValidPassword#123';
    const hash = await service.hashPassword(plain);

    const matches = await service.comparePassword('WrongPassword#123', hash);
    expect(matches).toBe(false);
  });
});
