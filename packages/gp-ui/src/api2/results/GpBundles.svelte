<script lang="ts">import GpCatalog from './GpCatalog.svelte';import type {GpClient} from '../client';import type {GpSession} from '../session.svelte';let {client,session}:{client:GpClient;session:GpSession}=$props();</script>
<GpCatalog {client} {session} kind="bundles"/>
