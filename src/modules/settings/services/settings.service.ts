import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Setting } from '../schemas/setting.schema';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(@InjectModel(Setting.name) private settingModel: Model<Setting>) {}

  async onModuleInit() {
    const exists = await this.settingModel.findOne({ key: 'maintenance_mode' });
    if (!exists) {
      await this.settingModel.create({
        key: 'maintenance_mode',
        isActive: false,
        message: 'Plataforma en mantenimiento, volvemos pronto.'
      });
      console.log('⚙️ Switch de mantenimiento creado en BD');
    }
  }

  async getStatus() {
    return this.settingModel.findOne({ key: 'maintenance_mode' });
  }
}