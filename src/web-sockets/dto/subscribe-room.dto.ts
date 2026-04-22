import { IsString, IsNotEmpty, Matches } from 'class-validator';

/**
 * DTO for subscribe_room / unsubscribe_room WebSocket events.
 * Room name must match the format: user:{id}, transaction:{id}, wallet:{id}, admin:global, fraud:alerts
 */
export class SubscribeRoomDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^(user:|transaction:|wallet:|admin:|fraud:).+$/, {
    message: 'room must match a valid NOTIFICATION_CHANNELS format',
  })
  room: string;
}
