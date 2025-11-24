import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../auth/schemas/user.schema'; // Importamos el Schema existente

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // 1. Listar todos los usuarios (ocultando password y token)
  async findAll() {
    return this.userModel.find()
      .select('-password -activationToken') // Excluimos campos sensibles
      .sort({ createdAt: -1 }) // Los más nuevos primero
      .exec();
  }

  // 2. Buscar uno por ID
  async findOne(id: string) {
    const user = await this.userModel.findById(id).select('-password -activationToken');
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  // 3. Cambiar estado (Activar/Desactivar)
  async toggleStatus(id: string) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Invertimos el valor actual
    user.isActive = !user.isActive;
    await user.save();

    return {
      message: `Usuario ${user.isActive ? 'activado' : 'desactivado'} correctamente`,
      isActive: user.isActive,
      user: { id: user._id, name: user.name, email: user.email }
    };
  }
}