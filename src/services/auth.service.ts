import { hash, compare } from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { UserRepository } from '@/repositories/user.repository';
import type { JWTPayload, UserRole } from '@/types';
import { generateId } from '@/utils/helpers';

export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private jwtSecret: string
  ) {}

  // Register Mahasiswa
  async registerMahasiswa(data: {
    nim: string;
    nama: string;
    email: string;
    password: string;
    fakultas?: string;
    prodi?: string;
    semester?: number;
    angkatan?: string;
    phone?: string;
  }) {
    // Check if user already exists
    const existingMahasiswa = await this.userRepo.findMahasiswaByNim(data.nim);
    if (existingMahasiswa) {
      throw new Error('NIM already registered');
    }

    const existingUserByEmail = await this.userRepo.findByEmail(data.email);
    if (existingUserByEmail) {
      throw new Error('Email already registered');
    }

    // Hash password
    const hashedPassword = await hash(data.password, 10);

    // Create user
    const userId = generateId();
    const user = await this.userRepo.create({
      id: userId,
      nama: data.nama,
      email: data.email,
      password: hashedPassword,
      role: 'MAHASISWA',
      phone: data.phone || null,
      isActive: true,
    });

    // Create mahasiswa profile
    const mahasiswa = await this.userRepo.createMahasiswa({
      nim: data.nim,
      id: userId,
      fakultas: data.fakultas || null,
      prodi: data.prodi || null,
      semester: data.semester || null,
      angkatan: data.angkatan || null,
    });

    // Generate token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      nim: mahasiswa.nim,
    });

    return {
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        nim: mahasiswa.nim,
        fakultas: mahasiswa.fakultas,
        prodi: mahasiswa.prodi,
      },
      token,
    };
  }

  // Register Admin/Kaprodi/Wakil Dekan
  async registerAdmin(data: {
    nip: string;
    nama: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'KAPRODI' | 'WAKIL_DEKAN';
    fakultas?: string;
    prodi?: string;
    phone?: string;
  }) {
    // Check if user already exists
    const existingAdmin = await this.userRepo.findAdminByNip(data.nip);
    if (existingAdmin) {
      throw new Error('NIP already registered');
    }

    const existingUserByEmail = await this.userRepo.findByEmail(data.email);
    if (existingUserByEmail) {
      throw new Error('Email already registered');
    }

    // Hash password
    const hashedPassword = await hash(data.password, 10);

    // Create user
    const userId = generateId();
    const user = await this.userRepo.create({
      id: userId,
      nama: data.nama,
      email: data.email,
      password: hashedPassword,
      role: data.role,
      phone: data.phone || null,
      isActive: true,
    });

    // Create admin profile
    const admin = await this.userRepo.createAdmin({
      id: userId,
      nip: data.nip,
      fakultas: data.fakultas || null,
      prodi: data.prodi || null,
    });

    // Generate token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      nip: admin.nip,
    });

    return {
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        nip: admin.nip,
        fakultas: admin.fakultas,
        prodi: admin.prodi,
      },
      token,
    };
  }

  // Register Dosen
  async registerDosen(data: {
    nip: string;
    nama: string;
    email: string;
    password: string;
    jabatan?: string;
    fakultas?: string;
    prodi?: string;
    phone?: string;
  }) {
    // Check if user already exists
    const existingDosen = await this.userRepo.findDosenByNip(data.nip);
    if (existingDosen) {
      throw new Error('NIP already registered');
    }

    const existingUserByEmail = await this.userRepo.findByEmail(data.email);
    if (existingUserByEmail) {
      throw new Error('Email already registered');
    }

    // Hash password
    const hashedPassword = await hash(data.password, 10);

    // Create user
    const userId = generateId();
    const user = await this.userRepo.create({
      id: userId,
      nama: data.nama,
      email: data.email,
      password: hashedPassword,
      role: 'DOSEN',
      phone: data.phone || null,
      isActive: true,
    });

    // Create dosen profile
    const dosen = await this.userRepo.createDosen({
      id: userId,
      nip: data.nip,
      jabatan: data.jabatan || null,
      fakultas: data.fakultas || null,
      prodi: data.prodi || null,
    });

    // Generate token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      nip: dosen.nip,
    });

    return {
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        nip: dosen.nip,
        jabatan: dosen.jabatan,
        fakultas: dosen.fakultas,
        prodi: dosen.prodi,
      },
      token,
    };
  }

  // Login with email
  async login(email: string, password: string) {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.isActive) {
      throw new Error('Account is inactive');
    }

    const isPasswordValid = await compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Get profile based on role
    const { profile } = await this.userRepo.getUserWithProfile(user.id);

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    // Add nim or nip to payload
    if (user.role === 'MAHASISWA' && profile) {
      payload.nim = (profile as any).nim;
    } else if (['ADMIN', 'KAPRODI', 'WAKIL_DEKAN', 'DOSEN'].includes(user.role) && profile) {
      payload.nip = (profile as any).nip;
    }

    const token = this.generateToken(payload);

    return {
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        ...profile,
      },
      token,
    };
  }

  private generateToken(payload: JWTPayload): string {
    return sign(payload, this.jwtSecret, { expiresIn: '7d' });
  }
}
