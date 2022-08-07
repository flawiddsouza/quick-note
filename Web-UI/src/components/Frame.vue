<template>
    <div class="app-container">
        <div class="app-bar">
           <slot name="app-bar"></slot>
        </div>
        <div class="app-content">
            <slot name="app-content"></slot>
        </div>
        <div class="app-action-area">
            <slot name="app-action-area"></slot>
        </div>
    </div>
</template>

<style scoped>
.app-container {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
}

.app-bar {
    height: 3.3rem;
    padding-left: 1rem;
    padding-right: 1rem;
    background-color: #3f51b5;
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0px 1px 2px 1px #c9c9c9;
    user-select: none;
}

.app-content {
    overflow-y: auto;
    display: grid;
    grid-template-rows: 1fr;
    position: relative;
}

.app-action-area {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
}
</style>
