/*
 * WASM C wrapper around cubiomes-bedrock.
 *
 * The exported surface mirrors static/mc/seed_engine.js (the Java build) so the
 * worldgen worker can talk to both engines with the same JS API:
 *
 *   wasm_create / wasm_destroy
 *   wasm_ctx_generate_biomes / wasm_ctx_structure_viable
 *   wasm_structure_pos / wasm_structure_region_size
 *   wasm_structure_type_count / wasm_structure_name_length / wasm_structure_name_ptr
 *   wasm_biome_colors
 *   wasm_version_newest / wasm_version_from_string
 *
 * Source: https://github.com/FragrantResult186/cubiomes-bedrock (MIT)
 */

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "generator.h"
#include "finders.h"
#include "util.h"

#ifdef __wasm__
#define EXPORT(name) __attribute__((export_name(name)))
#else
#define EXPORT(name)
#endif

typedef struct
{
    Generator g;
} EngineCtx;

static const char *const kStructureNames[FEATURE_NUM] = {
    "feature",
    "desert_pyramid",
    "jungle_pyramid",
    "swamp_hut",
    "igloo",
    "village",
    "ocean_ruin",
    "shipwreck",
    "monument",
    "mansion",
    "pillager_outpost",
    "ruined_portal",
    "ruined_portal_nether",
    "ancient_city",
    "buried_treasure",
    "mineshaft",
    "ravine",
    "lava_lake",
    "stronghold",
    "desert_well",
    "geode",
    "dungeon",
    "fortress",
    "bastion_remnant",
    "end_city",
    "end_gateway",
    "end_island",
    "trail_ruins",
    "trial_chambers",
    "abandoned_camp",
};

/* ------------------------------------------------------------------------- */
/* versions                                                                  */
/* ------------------------------------------------------------------------- */

EXPORT("wasm_version_newest")
int wasm_version_newest(void)
{
    return MC_NEWEST;
}

EXPORT("wasm_version_from_string")
int wasm_version_from_string(const char *label)
{
    if (!label || !*label)
        return MC_NEWEST;
    int mc = str2mc(label);
    return mc == MC_UNDEF ? MC_NEWEST : mc;
}

/* ------------------------------------------------------------------------- */
/* biome generation                                                          */
/* ------------------------------------------------------------------------- */

static int gen_range(const Generator *g, int scale, int x, int z, int w, int h,
                     int y, int *out)
{
    if (scale != 1 && scale != 4 && scale != 16 && scale != 64 && scale != 256)
        return 1; /* matches cubiomes' supported biome scales */

    /* 'y' is in cubiomes Range units (1:4 for scale > 1), like the Java build. */
    Range r = {scale, x, z, w, h, y, 1};
    int *cache = allocCache(g, r);
    if (!cache)
        return 2;
    int err = genBiomes(g, cache, r);
    if (err == 0)
        memcpy(out, cache, (size_t)w * h * sizeof(int));
    free(cache);
    return err;
}

EXPORT("wasm_create")
void *wasm_create(int mc, int dim, uint32_t seedLo, uint32_t seedHi)
{
    if (mc <= MC_UNDEF || mc > MC_NEWEST)
        return NULL;

    EngineCtx *ctx = (EngineCtx *)calloc(1, sizeof(EngineCtx));
    if (!ctx)
        return NULL;

    setupGenerator(&ctx->g, mc, 0);
    uint64_t seed = ((uint64_t)seedHi << 32) | (uint64_t)seedLo;
    applySeed(&ctx->g, dim, seed);
    return ctx;
}

EXPORT("wasm_destroy")
void wasm_destroy(void *handle)
{
    free(handle);
}

EXPORT("wasm_ctx_generate_biomes")
int wasm_ctx_generate_biomes(void *handle, int x, int z, int w, int h,
                             int scale, int y, int *out)
{
    EngineCtx *ctx = (EngineCtx *)handle;
    if (!ctx || !out || w <= 0 || h <= 0)
        return 1;
    return gen_range(&ctx->g, scale, x, z, w, h, y, out);
}

EXPORT("wasm_ctx_structure_viable")
int wasm_ctx_structure_viable(void *handle, int type, int x, int z)
{
    EngineCtx *ctx = (EngineCtx *)handle;
    if (!ctx)
        return 0;
    return isViableStructurePos(type, &ctx->g, x, z, 0);
}

/* ------------------------------------------------------------------------- */
/* structures                                                                */
/* ------------------------------------------------------------------------- */

EXPORT("wasm_structure_pos")
int wasm_structure_pos(int type, int mc, uint32_t seedLo, uint32_t seedHi,
                       int regX, int regZ, int *out)
{
    if (!out)
        return 0;
    uint64_t seed = ((uint64_t)seedHi << 32) | (uint64_t)seedLo;
    Pos pos;
    if (!getStructurePos(type, mc, seed, regX, regZ, &pos))
        return 0;
    out[0] = pos.x;
    out[1] = pos.z;
    return 1;
}

EXPORT("wasm_structure_region_size")
int wasm_structure_region_size(int type, int mc)
{
    StructureConfig sconf;
    if (!getStructureConfig(type, mc, &sconf))
        return 0;
    return sconf.regionSize;
}

EXPORT("wasm_structure_type_count")
int wasm_structure_type_count(void)
{
    return FEATURE_NUM;
}

EXPORT("wasm_structure_name_length")
int wasm_structure_name_length(int type)
{
    if (type < 0 || type >= FEATURE_NUM)
        return 0;
    return (int)strlen(kStructureNames[type]);
}

EXPORT("wasm_structure_name_ptr")
const char *wasm_structure_name_ptr(int type)
{
    if (type < 0 || type >= FEATURE_NUM)
        return NULL;
    return kStructureNames[type];
}

/* ------------------------------------------------------------------------- */
/* biome colors                                                              */
/* ------------------------------------------------------------------------- */

EXPORT("wasm_biome_colors")
int wasm_biome_colors(unsigned char *out)
{
    if (!out)
        return 1;
    initBiomeColors((unsigned char(*)[3])out);
    return 0;
}
