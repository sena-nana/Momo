<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const email = ref("");
const router = useRouter();

function onSubmit() {
  void router.push("/today");
}
</script>

<template>
  <div class="auth">
    <form class="auth__card" @submit.prevent="onSubmit">
      <h1>Momo</h1>
      <p class="auth__hint">
        OIDC / Passkeys 登录链路待接入（BE-01）。当前为占位入口。
      </p>
      <label class="auth__label">
        Email
        <input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          required
        />
      </label>
      <button type="submit">Continue</button>
    </form>
  </div>
</template>
