import { Controller, Get, Post, Body, Patch, Param, ParseIntPipe, Delete} from '@nestjs/common'
import type { Track } from './tracks.interfaces'
import { TracksService } from './tracks.service'
import { CreateTrackDto } from './create-track.dto'
import { UpdateTrackDto } from './update-track.dto'

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  /**
   * Returns an array of all tracks.
   * @returns {Track[]} An array of all tracks.
   */
  findAll(): Track[] {
    return this.tracksService.findAll()
  }

  @Get(':id')
  /**
   * Returns a track by its id.
   * @param {number} id The id of the track to be returned.
   * @returns {Track} The track with the given id.
   * @throws {NotFoundException} If the track with the given id is not found.
   */
  findOne(@Param('id', ParseIntPipe) id: number): Track {
    return this.tracksService.findOne(id)
  }

  @Post()

  /**
   * Creates a new track.
   * @param {CreateTrackDto} createTrackDto The track data to be created.
   * @returns {Track} The newly created track.
   */
  create(
    @Body() createTrackDto: CreateTrackDto): Track {
    return this.tracksService.create(createTrackDto)
  }

  @Patch(':id')
  /**
   * Updates a track by its id.
   * @param {number} id The id of the track to be updated.
   * @param {UpdateTrackDto} updateTrackDto The track data to be updated.
   * @returns {Track} The updated track.
   * @throws {NotFoundException} If the track with the given id is not found.
   */
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTrackDto: UpdateTrackDto): Track {
    return this.tracksService.update(id, updateTrackDto)
  }

  @Delete(':id')
  /**
   * Removes a track by its id.
   * @param {number} id The id of the track to be removed.
   * @throws {NotFoundException} If the track with the given id is not found.
   */
  remove(@Param('id', ParseIntPipe) id: number): void {
    this.tracksService.remove(id)
  }
}
