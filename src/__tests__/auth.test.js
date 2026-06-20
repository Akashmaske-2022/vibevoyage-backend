const request = require('supertest');
const app = require('../../src/app');

// Mock Prisma to avoid actual DB calls in tests
jest.mock('../../src/models/prismaClient', () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  passwordReset: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((ops) => Promise.all(ops)),
  $disconnect: jest.fn(),
}));

const prisma = require('../../src/models/prismaClient');

const bcrypt = require('bcryptjs');

describe('POST /api/auth/signup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should create a user and return tokens', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      tier: 'FREE',
      createdAt: new Date(),
    });
    prisma.refreshToken.create.mockResolvedValue({});

    const res = await request(app).post('/api/auth/signup').send({
      email: 'test@example.com',
      password: 'SecurePass1!',
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('should return 409 if email already exists', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    const res = await request(app).post('/api/auth/signup').send({
      email: 'existing@example.com',
      password: 'SecurePass1!',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('should return 400 for weak password', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'test@example.com',
      password: 'weak',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should login with valid credentials', async () => {
    const hash = await bcrypt.hash('SecurePass1!', 12);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      tier: 'FREE',
      passwordHash: hash,
    });
    prisma.refreshToken.create.mockResolvedValue({});

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'SecurePass1!',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('should return 401 for invalid password', async () => {
    const hash = await bcrypt.hash('CorrectPass1!', 12);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      tier: 'FREE',
      passwordHash: hash,
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'WrongPass1!',
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return 401 for non-existent user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'AnyPass1!',
    });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
