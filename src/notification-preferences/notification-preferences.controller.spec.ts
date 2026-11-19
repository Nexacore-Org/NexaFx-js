import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UpdatePreferencesRequestDto } from './dto/update-preferences.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('NotificationPreferencesController', () => {
  function build() {
    const service = {
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
    };
    return {
      controller: new NotificationPreferencesController(
        service as unknown as NotificationPreferencesService,
      ),
      service,
    };
  }

  const req = { user: { sub: 'user-1' } };

  it('types PATCH with the validated request DTO', () => {
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        NotificationPreferencesController.prototype,
        'patchPreferences',
      )[1],
    ).toBe(UpdatePreferencesRequestDto);
  });

  it('keeps the JWT guard on the controller', () => {
    expect(
      Reflect.getMetadata('__guards__', NotificationPreferencesController),
    ).toContain(JwtAuthGuard);
  });

  it('forwards PATCH preferences to the service', async () => {
    const { controller, service } = build();
    const preferences = [
      {
        channel: 'email',
        eventType: 'transaction',
        isEnabled: true,
      },
    ];
    await controller.patchPreferences(req, { preferences } as any);
    expect(service.updatePreferences).toHaveBeenCalledWith(
      'user-1',
      preferences,
    );
  });

  it('forwards PUT preferences to the same service method', async () => {
    const { controller, service } = build();
    const preferences = [
      {
        channel: 'push',
        eventType: 'security',
        isEnabled: true,
      },
    ];
    await controller.updatePreferences(req, { preferences } as any);
    expect(service.updatePreferences).toHaveBeenCalledWith(
      'user-1',
      preferences,
    );
  });
});
