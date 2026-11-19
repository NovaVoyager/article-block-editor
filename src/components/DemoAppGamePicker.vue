<script setup lang="ts">
import type { AppGameData, AppGameKind, AppGamePickerScope } from '../editor/app-game-card'

defineProps<AppGamePickerScope>()
const catalog: Record<AppGameKind, AppGameData[]> = {
  app: [
    { id: 'sky', name: '星图', icon: 'https://placehold.co/128x128/284969/ffffff?text=Sky', category: '教育',
      rating: 4.8, version: '2.1', developer: '星图工作室', banner: 'https://placehold.co/640x360/284969/ffffff?text=Night+Sky,https://placehold.co/640x360/426581/ffffff?text=Day+Sky' },
  ],
  game: [
    { id: 'islands', name: '群岛', icon: 'https://placehold.co/128x128/226756/ffffff?text=Isles', category: '冒险',
      rating: 4.6, version: '1.4', developer: '潮汐游戏', banner: 'https://placehold.co/640x360/226756/ffffff?text=Islands' },
  ],
}
</script>

<template>
  <div class="demo-resource-picker">
    <button v-for="item in catalog[kind]" :key="item.id" type="button" @click="select(item)">
      <strong>{{ item.name }}</strong><span>{{ item.category }} · {{ item.developer }}</span>
      <small v-if="current?.id === item.id">当前条目</small>
    </button>
  </div>
</template>
