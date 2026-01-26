import { Controller, Get } from '@nestjs/common';
import { SettingsService } from '../services/settings.service';

// Asegúrate de que este endpoint sea PÚBLICO en tus Guards globales
// Si usas un decorador como @Public() agrégalo aquí.
@Controller('system-settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('status')
  async getSystemStatus() {
    const setting = await this.settingsService.getStatus();
    return { 
      maintenance: setting ? setting.isActive : false,
      message: setting ? setting.message : ''
    };
  }
}