import { Controller, Get, Param, Req } from "@nestjs/common";
import { Request } from "express";
import { NotFoundException } from "../common/exceptions/localized.exception";

@Controller("users")
export class UsersController {
  @Get(":id")
  async findOne(@Param("id") id: string, @Req() request: Request) {
    const user = null; // Simulate user not found

    if (!user) {
      throw new NotFoundException("User");
    }

    return user;
  }
}
