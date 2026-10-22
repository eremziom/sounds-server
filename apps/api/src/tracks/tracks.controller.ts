import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import type { Track } from './tracks.interfaces';
import { TracksService } from './tracks.service';
import { CreateTrackDto } from './create-track.dto';
import { UpdateTrackDto } from './update-track.dto';

@Controller('tracks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  @RequirePermissions('tracks:read')
  /**
   * Returns an array of all tracks.
   * @returns {Track[]} An array of all tracks.
   */
  async findAll(): Promise<Track[]> {
    return this.tracksService.findAll();
  }

  @Get(':id')
  @RequirePermissions('tracks:read')
  /**
   * Returns a track by its id.
   * @param {number} id The id of the track to be returned.
   * @returns {Track} The track with the given id.
   * @throws {NotFoundException} If the track with the given id is not found.
   */
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Track> {
    return this.tracksService.findOne(id);
  }

  @Post()
  @RequirePermissions('tracks:create')

  /**
   * Creates a new track.
   * @param {CreateTrackDto} createTrackDto The track data to be created.
   * @returns {Track} The newly created track.
   */
  async create(@Body() createTrackDto: CreateTrackDto): Promise<Track> {
    return this.tracksService.create(createTrackDto);
  }

  @Patch(':id')
  @RequirePermissions('tracks:update-any')
  /**
   * Updates a track by its id.
   * @param {number} id The id of the track to be updated.
   * @param {UpdateTrackDto} updateTrackDto The track data to be updated.
   * @returns {Track} The updated track.
   * @throws {NotFoundException} If the track with the given id is not found.
   */
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTrackDto: UpdateTrackDto,
  ): Promise<Track> {
    return this.tracksService.update(id, updateTrackDto);
  }

  @Delete(':id')
  @RequirePermissions('tracks:delete-any')
  /**
   * Removes a track by its id.
   * @param {number} id The id of the track to be removed.
   * @throws {NotFoundException} If the track with the given id is not found.
   */
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.tracksService.remove(id);
  }
}
