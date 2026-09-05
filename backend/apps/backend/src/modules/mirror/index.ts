import { Module } from "@medusajs/framework/utils"
import MirrorModuleService from "./service"

export const MIRROR_MODULE = "mirror"

export default Module(MIRROR_MODULE, {
  service: MirrorModuleService,
})
